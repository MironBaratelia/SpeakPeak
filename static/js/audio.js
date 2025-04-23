let audioContext, inputAnalyser, outputAnalyser, mediaRecorder, audioChunks = [], audioElement;
let isRecording = false, bars = [], waveformData = [];
let recordingStartTime = 0, totalDuration = 0;
let errorTimestamps = [];
let playbackErrorTimestamps = [];
let activeErrorMarkers = [];
let currentRecordId;

const CONFIG = {
    BAR_WIDTH: 5,
    SCROLL_SPEED: 50,
    VISUALIZER_WIDTH: 600,
    SAMPLE_RATE: 10,
    BAR_GAP: 11,
    INPUT_SENSITIVITY: 2.0,
    OUTPUT_SENSITIVITY: 1.0
};

const state = {
    currentPage: 'record',
    audioBlob: null,
    recordName: localStorage.getItem('recordName') || '',
    selectedFolder: parseInt(localStorage.getItem('selectedFolder')) || null,
    recordMode: localStorage.getItem('recordMode') || 'tab' // Добавляем режим записи
};

const elements = {
    pages: {
        record: document.getElementById('record-page'),
        save: document.getElementById('save-page'),
        playback: document.getElementById('playback-page')
    },
    recording: document.getElementById('recording-visualizer'),
    playback: document.getElementById('playback-visualizer'),
    startBtn: document.getElementById('start'),
    stopBtn: document.getElementById('stop'),
    errorBtn: document.getElementById('error-btn'),
    playBtn: document.getElementById('play-pause'),
    marker: document.getElementById('playback-marker'),
    recordingTimer: document.getElementById('recording-timer'),
    playbackTimer: document.getElementById('playback-timer'),
    recordNameInput: document.getElementById('record-name'),
    saveBtn: document.getElementById('save'),
    folderBtns: document.querySelectorAll('.folder-btn'),
    checkpointsList: document.getElementById('checkpoints-list')
};

// Настройка аудио контекста
function setupAudioContext(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Создаем анализаторы для входного и выходного потока
    inputAnalyser = audioContext.createAnalyser();
    outputAnalyser = audioContext.createAnalyser();
    
    // Настраиваем анализаторы
    inputAnalyser.fftSize = 2048;
    outputAnalyser.fftSize = 2048;
    
    // Создаем источник из потока
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(inputAnalyser);
    
    // Настраиваем запись
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.addEventListener('dataavailable', e => audioChunks.push(e.data));
    mediaRecorder.addEventListener('stop', handleRecordingStop);
    
    // Запускаем анализ аудио
    startAudioAnalysis();
}

// В начале файла добавим функцию для генерации названия по умолчанию
function generateDefaultName() {
    const now = new Date();
    const date = now.toLocaleDateString('ru', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    
    // Generate a random number between 1 and 100 to avoid saving conflicts
    // This is a temporary solution until a proper API endpoint is available
    // Get a named index from sessionStorage to persist across page refreshes
    let todayIndex = sessionStorage.getItem('todayRecordingIndex');
    
    if (!todayIndex) {
        // First record of the session
        todayIndex = 1;
    } else {
        // Increment for each new recording in this session
        todayIndex = parseInt(todayIndex) + 1;
    }
    
    // Store back to sessionStorage
    sessionStorage.setItem('todayRecordingIndex', todayIndex);
    
    return `${date} (${todayIndex})`;
}

// Функция записи через системный звук с BlackHole
async function startSystemRecording() {
    try {
        // Очищаем предыдущие данные
        audioChunks = [];
        waveformData = [];
        errorTimestamps = [];
        
        // Запрашиваем доступ к микрофону и системному звуку
        const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        // Получаем список устройств после получения разрешения на микрофон
        const devices = await navigator.mediaDevices.enumerateDevices();
        const blackHoleDevice = devices.find(device => 
            device.kind === 'audioinput' && 
            device.label.toLowerCase().includes('blackhole')
        );

        // Если нашли BlackHole, получаем его поток
        let systemStream = null;
        if (blackHoleDevice) {
            systemStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: blackHoleDevice.deviceId,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
        } else {
            // Если BlackHole не найден, показываем сообщение и предлагаем использовать запись с вкладки
            const useTabInstead = confirm('Устройство BlackHole не найдено. Хотите использовать запись с вкладки вместо этого?');
            
            if (useTabInstead) {
                // Переключаемся на режим записи с вкладки
                localStorage.setItem('recordMode', 'tab');
                autoStartRecording();
            } else {
                alert('Запись не может быть начата. Убедитесь, что BlackHole установлен и включен, или используйте запись с вкладки.');
            }
            return;
        }

        // Настраиваем аудио контекст
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Создаем анализаторы
        inputAnalyser = audioContext.createAnalyser();
        outputAnalyser = audioContext.createAnalyser();
        
        inputAnalyser.fftSize = 2048;
        outputAnalyser.fftSize = 2048;

        // Подключаем микрофон к inputAnalyser
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(inputAnalyser);

        // Если есть системный звук, подключаем его к outputAnalyser
        if (systemStream) {
            const systemSource = audioContext.createMediaStreamSource(systemStream);
            systemSource.connect(outputAnalyser);
        }

        // Настраиваем запись (записываем оба потока)
        const streams = [micStream];
        if (systemStream) streams.push(systemStream);
        const combinedStream = new MediaStream(
            streams.flatMap(stream => stream.getAudioTracks())
        );

        mediaRecorder = new MediaRecorder(combinedStream);
        mediaRecorder.addEventListener('dataavailable', e => audioChunks.push(e.data));
        mediaRecorder.addEventListener('stop', handleRecordingStop);

        // Запускаем запись
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = performance.now();
        
        // Запускаем анализ аудио
        startAudioAnalysis();
        
        // Обновляем UI
        updateRecordingTimer();
        updateControls();
        
    } catch (error) {
        console.error('Ошибка при начале записи через системный звук:', error);
        
        // Предлагаем переключиться на запись с вкладки
        const useTabInstead = confirm(`Ошибка при записи через системный звук: ${error.message}. Хотите использовать запись с вкладки вместо этого?`);
        
        if (useTabInstead) {
            // Переключаемся на режим записи с вкладки
            localStorage.setItem('recordMode', 'tab');
            autoStartRecording();
        } else {
            alert('Запись не может быть начата. Попробуйте еще раз или используйте другой метод записи.');
        }
    }
}

async function autoStartRecording() {
    try {
        // Change the getDisplayMedia options to allow any tab selection
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ 
            audio: true,
            video: {
                height: 0,
                width: 0,
                displaySurface: "browser" // This allows selecting any tab
            }
        });
        
        // We don't need the video for audio recording
        displayStream.getVideoTracks().forEach(track => track.stop());
        
        // Check if user included audio when sharing the tab
        if (!displayStream.getAudioTracks().length) {
            displayStream.getTracks().forEach(track => track.stop());
            alert('Аудио не выбрано. Убедитесь, что выбранная вкладка содержит аудио и включена опция "Поделиться звуком".');
            return;
        }
        
        console.log('Аудиотреки из вкладки:', displayStream.getAudioTracks().length);
        
        // Now, get microphone audio
        const micStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true,
            video: false
        });
        
        console.log('Аудиотреки из микрофона:', micStream.getAudioTracks().length);
        
        // Initialize audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create and configure analyzers
        inputAnalyser = audioContext.createAnalyser();
        outputAnalyser = audioContext.createAnalyser();
        
        inputAnalyser.fftSize = 2048;
        outputAnalyser.fftSize = 2048;
        
        // Create source from the display stream
        const displaySource = audioContext.createMediaStreamSource(displayStream);
        
        // Create gain node for tab audio
        const displayGain = audioContext.createGain();
        displayGain.gain.value = 1.0; // Default volume for tab audio
        
        // Connect display source to its gain node
        displaySource.connect(displayGain);
        
        // Connect display gain to the output analyzer for visualization
        displayGain.connect(outputAnalyser);
        
        // Create source from the microphone stream
        const micSource = audioContext.createMediaStreamSource(micStream);
        
        // Create gain node for microphone audio
        const micGain = audioContext.createGain();
        micGain.gain.value = 1.0; // Default volume for microphone
        
        // Connect mic source to its gain node
        micSource.connect(micGain);
        
        // Connect mic gain to the input analyzer for visualization
        micGain.connect(inputAnalyser);
        
        // Create a destination to mix both streams
        const destination = audioContext.createMediaStreamDestination();
        
        // Connect both gain nodes to destination
        displayGain.connect(destination);
        micGain.connect(destination);
        
        // Store gain nodes in a global object for later adjustment
        window.audioGains = {
            display: displayGain,
            mic: micGain
        };
        
        // Initialize MediaRecorder with the combined stream
        mediaRecorder = new MediaRecorder(destination.stream);
        mediaRecorder.addEventListener('dataavailable', e => audioChunks.push(e.data));
        mediaRecorder.addEventListener('stop', handleRecordingStop);
        
        // Start recording
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = performance.now();
        
        // Start audio analysis
        startAudioAnalysis();
        
        // Update UI
        updateRecordingTimer();
        updateControls();
        
    } catch (error) {
        console.error('Ошибка доступа к аудио вкладки:', error);
        
        // Если у нас был режим "tab", предложим переключиться на системный звук
        if (state.recordMode === 'tab') {
            const useSystemInstead = confirm(`Ошибка при записи с вкладки: ${error.message}. Хотите попробовать запись системного звука?`);
            
            if (useSystemInstead) {
                // Переключаемся на режим записи системного звука
                localStorage.setItem('recordMode', 'system');
                startSystemRecording();
            } else {
                alert('Запись не может быть начата. Попробуйте еще раз или используйте другой метод записи.');
            }
        } else {
            alert('Ошибка доступа к аудио: ' + error.message);
        }
    }
}

// Запускаем автостарт сразу, если мы на странице записи
if (window.location.pathname === '/record') {
    // Загружаем сохраненные настройки режима записи
    state.recordMode = localStorage.getItem('recordMode') || 'tab';
    
    // Выбираем метод записи на основе сохраненного режима
    if (state.recordMode === 'tab') {
        autoStartRecording();
    } else {
        startSystemRecording();
    }
}

// Инициализация
async function init() {
    if (window.location.pathname === '/save') {
        // Устанавливаем название по умолчанию
        if (elements.recordNameInput) {
            // Now this is async
            const defaultName = await generateDefaultName();
            elements.recordNameInput.value = defaultName;
            state.recordName = defaultName; // Устанавливаем значение в state
            
            elements.recordNameInput.addEventListener('input', (e) => {
                state.recordName = e.target.value;
            });
        }
        
        // Загружаем папки
        loadFolders();
    }

    if (elements.startBtn) elements.startBtn.addEventListener('click', startRecording);
    if (elements.stopBtn) elements.stopBtn.addEventListener('click', stopRecording);
    if (elements.errorBtn) elements.errorBtn.addEventListener('click', markError);
    if (elements.playBtn) elements.playBtn.addEventListener('click', togglePlayPause);
    if (elements.playback) elements.playback.addEventListener('click', handleScrubberClick);
    if (elements.saveBtn) elements.saveBtn.addEventListener('click', saveRecording);

    // Проверяем, находимся ли мы на странице воспроизведения
    if (window.location.pathname.startsWith('/playback/')) {
        const recordId = window.location.pathname.split('/').pop();
        if (recordId) {
            preparePlayback(recordId);
        }
    }
}

async function loadFolders() {
    try {
        const response = await fetch('/api/folders');
        if (!response.ok) throw new Error('Ошибка при загрузке папок');
        
        const folders = await response.json();
        const foldersContainer = document.querySelector('.folders-container');
        if (!foldersContainer) return;

        foldersContainer.innerHTML = '';
        
        // Находим папку "Черновики"
        const draftsFolder = folders.find(folder => folder.name === "Черновики");
        
        folders.forEach(folder => {
            const btn = document.createElement('button');
            btn.className = 'folder-btn';
            btn.dataset.folder = folder.id;
            btn.textContent = folder.name;
            
            // Если это папка "Черновики" или ранее выбранная папка
            if ((draftsFolder && folder.id === draftsFolder.id && !state.selectedFolder) || 
                folder.id === state.selectedFolder) {
                btn.classList.add('active');
                state.selectedFolder = folder.id;
            }
            
            btn.addEventListener('click', () => {
                document.querySelectorAll('.folder-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.selectedFolder = folder.id;
            });
            
            foldersContainer.appendChild(btn);
        });
    } catch (error) {
        console.error('Ошибка при загрузке папок:', error);
        alert('Ошибка при загрузке папок: ' + error.message);
    }
}

// Переключение страниц
function switchPage(page) {
    if (page === 'record') window.location.href = '/record';
    else if (page === 'save') window.location.href = '/save';
    else if (page === 'playback') {
        const recordId = new URLSearchParams(window.location.search).get('record_id');
        window.location.href = `/playback/${recordId}`;
    }
}

// Форматирование времени
function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Обновление таймера записи
function updateRecordingTimer() {
    if (!isRecording || !elements.recordingTimer) return;
    const currentTime = performance.now() - recordingStartTime;
    elements.recordingTimer.textContent = formatTime(currentTime);
    requestAnimationFrame(updateRecordingTimer);
}

// Обновление таймера воспроизведения
function updatePlaybackTimer() {
    if (!audioElement || !elements.playbackTimer) return;
    const currentTime = audioElement.currentTime * 1000;
    elements.playbackTimer.innerHTML = `${formatTime(currentTime)} <span class="playback-timer-all">/ ${formatTime(totalDuration)}</span>`;
    if (!audioElement.paused) requestAnimationFrame(updatePlaybackTimer);
}

// Сброс состояния
function resetState() {
    bars = [];
    errorTimestamps = [];
    activeErrorMarkers = [];
    waveformData = [];
    if (elements.recording) elements.recording.innerHTML = '<div id="center-line"></div>';
}

// Анализ аудио
function startAudioAnalysis() {
    const inputDataArray = new Uint8Array(inputAnalyser.frequencyBinCount);
    const outputDataArray = new Uint8Array(outputAnalyser.frequencyBinCount);
    let lastBarTime = 0;

    function analyze() {
        if (!isRecording) return;

        const currentTime = performance.now();
        if (currentTime - lastBarTime > 200) {
            // Получаем данные с обоих анализаторов
            inputAnalyser.getByteFrequencyData(inputDataArray);
            outputAnalyser.getByteFrequencyData(outputDataArray);

            // Рассчитываем средние значения
            const inputSum = inputDataArray.reduce((a, b) => a + b, 0);
            const inputAvg = inputSum / inputDataArray.length;
            
            const outputSum = outputDataArray.reduce((a, b) => a + b, 0);
            const outputAvg = outputSum / outputDataArray.length;

            // Сохраняем оба значения
            waveformData.push({
                input: inputAvg / 255,
                output: outputAvg / 255,
                time: currentTime - recordingStartTime
            });

            if (elements.recording) {
                const totalHeight = Math.min(
                    (inputAvg * CONFIG.INPUT_SENSITIVITY + outputAvg * CONFIG.OUTPUT_SENSITIVITY) * 0.9, 
                    240
                );

                const bar = document.createElement('div');
                bar.className = 'bar';
                bar.style.cssText = `
                    height: ${totalHeight}px;
                    width: ${CONFIG.BAR_WIDTH}px;
                    right: 0;
                `;
                bar.dataset.timestamp = currentTime;
                elements.recording.appendChild(bar);
                bars.push(bar);

                // Удаление старых столбцов
                bars.forEach((oldBar, index) => {
                    const timeAlive = currentTime - parseFloat(oldBar.dataset.timestamp);
                    const position = (timeAlive / 1000) * CONFIG.SCROLL_SPEED;
                    if (position > CONFIG.VISUALIZER_WIDTH) {
                        oldBar.remove();
                        bars.splice(index, 1);
                    }
                });

                updatePositions(currentTime);
                lastBarTime = currentTime;
            }
        }
        requestAnimationFrame(analyze);
    }
    requestAnimationFrame(analyze);
}

// Обновление позиций столбцов
function updatePositions(currentTime) {
    requestAnimationFrame(() => updatePositions(performance.now())); // Добавляем постоянное обновление

    bars.forEach((bar, i) => {
        const timeAlive = currentTime - parseFloat(bar.dataset.timestamp);
        const position = (timeAlive / 1000) * CONFIG.SCROLL_SPEED;
        bar.style.right = `${position}px`;
        
        if (position > CONFIG.VISUALIZER_WIDTH) {
            bar.remove();
            bars.splice(i, 1);
        }
    });

    activeErrorMarkers.forEach((marker, i) => {
        const timeAlive = currentTime - marker.timestamp;
        const position = (timeAlive / 1000) * CONFIG.SCROLL_SPEED;
        marker.element.style.right = `${position}px`;

        if (position > CONFIG.VISUALIZER_WIDTH) {
            marker.element.remove();
            activeErrorMarkers.splice(i, 1);
        }
    });
}

// Обработка остановки записи
function handleRecordingStop() {
    // Создаем blob из записанных чанков
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    
    // Конвертируем в base64
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = () => {
        const base64Audio = reader.result;
        // Сохраняем во временное хранилище
        sessionStorage.setItem('tempAudioData', base64Audio);
        sessionStorage.setItem('tempDuration', recordingStartTime ? (performance.now() - recordingStartTime) : 0);
        sessionStorage.setItem('tempErrorTimestamps', JSON.stringify(errorTimestamps));
        sessionStorage.setItem('tempWaveformData', JSON.stringify(waveformData));
        
        // Переходим на страницу сохранения
        window.location.href = '/save';
    };
}

// Начало записи
function startRecording() {
    // Reset state before starting a new recording
    audioChunks = [];
    waveformData = [];
    errorTimestamps = [];
    
    // Выбираем метод записи на основе сохраненного режима
    state.recordMode = localStorage.getItem('recordMode') || 'tab';
    
    if (state.recordMode === 'tab') {
        // Запись звука с вкладки браузера
        autoStartRecording();
    } else {
        // Запись системного звука через BlackHole
        startSystemRecording();
    }
}

// Отметка ошибки
function markError() {
    if (!isOwner) return; // Только владелец может отмечать ошибки

    if (isRecording) {
        const timestamp = performance.now();
        const timeOffset = timestamp - recordingStartTime;
        errorTimestamps.push(timeOffset);

        const marker = {
            timestamp: timestamp,
            element: createErrorMarkerElement()
        };
        activeErrorMarkers.push(marker);
    } else if (audioElement) {
        const currentTime = audioElement.currentTime * 1000;
        
        // Используем сохраненный ID записи
        fetch(`/api/records/${currentRecordId}/errors`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ time: currentTime })
        }).then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('Failed to save error');
        }).then(data => {
            const mistakeId = data.mistake_id;
            playbackErrorTimestamps.push(currentTime);
            playbackErrorTimestamps.sort((a, b) => a - b);

            const markerElement = createErrorMarkerElement();
            positionErrorMarker(markerElement, currentTime);
            addCheckpoint(currentTime, 'playback-error', mistakeId);
        }).catch(error => {
            console.error('Ошибка при сохранении ошибки:', error);
            alert('Ошибка при сохранении ошибки: ' + error.message);
        });
    }
}

// Создание элемента маркера ошибки
function createErrorMarkerElement() {
    const marker = document.createElement('div');
    marker.className = 'error-marker ' + (isRecording ? 'recording-error' : 'playback-error');
    marker.style.right = '0px';
    
    if (isRecording) {
        elements.recording.appendChild(marker);
    } else if (!isRecording && elements.playback) {
        elements.playback.appendChild(marker);
    }
    
    return marker;
}

// Позиционирование маркера ошибки
function positionErrorMarker(element, timeOffset) {
    const position = CONFIG.VISUALIZER_WIDTH - (timeOffset / totalDuration) * CONFIG.VISUALIZER_WIDTH;
    element.style.right = `${position}px`;
    element.dataset.timeOffset = timeOffset;
}

// Добавление чекпоинта
function addCheckpoint(time, type, mistakeId, comment = '') {
    const checkpoint = document.createElement('div');
    checkpoint.className = 'checkpoint-item';
    checkpoint.dataset.time = time;
    checkpoint.dataset.mistakeId = mistakeId;  // Добавляем mistake_id

    checkpoint.innerHTML = `
        <span class="checkpoint-time">${formatTime(time)}</span>
        ${comment ? `<div class="checkpoint-comment">${comment}</div>` : ''}
        ${isOwner ? `
            <div class="checkpoint-actions">
                <i class="fas fa-edit checkpoint-action edit-checkpoint"></i>
                <i class="fas fa-trash checkpoint-action delete-checkpoint" data-mistake-id="${mistakeId}"></i>
            </div>
        ` : ''}
    `;

    // Обработчик клика на элемент ошибки
    checkpoint.addEventListener('click', () => {
        if (audioElement) {
            audioElement.currentTime = time / 1000;  // Переключаем воспроизведение
            if (audioElement.paused) {
                audioElement.play();  // Если аудио на паузе, запускаем воспроизведение
            }
        }
    });

    // Обработчик удаления
    if (isOwner) {
        checkpoint.querySelector('.delete-checkpoint').addEventListener('click', (e) => {
            e.stopPropagation();  // Останавливаем всплытие события
            const mistakeId = e.target.dataset.mistakeId;  // Получаем mistake_id
            deleteCheckpoint(mistakeId, checkpoint);
        });
        
        // Добавляем обработчик для кнопки редактирования
        checkpoint.querySelector('.edit-checkpoint').addEventListener('click', (e) => {
            e.stopPropagation();  // Останавливаем всплытие события
            const currentComment = checkpoint.querySelector('.checkpoint-comment')?.textContent || '';
            showEditForm(checkpoint, time, type, currentComment);
        });
    }

    elements.checkpointsList.appendChild(checkpoint);
    sortCheckpoints();
}

// Показать форму редактирования
function showEditForm(checkpoint, time, type, currentComment = '') {
    const editForm = document.createElement('div');
    editForm.className = 'checkpoint-edit-form';
    editForm.innerHTML = `
        <textarea placeholder="Введите комментарий к ошибке">${currentComment || ''}</textarea>
        <div class="actions">
            <button class="cancel-edit">Отмена</button>
            <button class="save-comment">Сохранить</button>
        </div>
    `;

    // Заменяем действия на форму
    const actionsDiv = checkpoint.querySelector('.checkpoint-actions');
    actionsDiv.style.display = 'none';
    
    // Скрываем существующий комментарий, если он есть
    const commentDiv = checkpoint.querySelector('.checkpoint-comment');
    if (commentDiv) {
        commentDiv.style.display = 'none';
    }
    
    checkpoint.appendChild(editForm);

    // Фокусируем на текстовом поле
    const textarea = editForm.querySelector('textarea');
    textarea.focus();
    // Ставим курсор в конец текста
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Обработчики кнопок
    editForm.querySelector('.cancel-edit').addEventListener('click', () => {
        editForm.remove();
        actionsDiv.style.display = 'flex';
        // Показываем комментарий обратно при отмене
        if (commentDiv) {
            commentDiv.style.display = '';
        }
    });

    editForm.querySelector('.save-comment').addEventListener('click', async () => {
        const comment = textarea.value.trim();
        try {
            await saveComment(currentRecordId, time, comment);
            
            // Обновляем отображение
            if (comment) {
                if (commentDiv) {
                    commentDiv.textContent = comment;
                    commentDiv.style.display = ''; // Показываем обновленный комментарий
                } else {
                    const newCommentDiv = document.createElement('div');
                    newCommentDiv.className = 'checkpoint-comment';
                    newCommentDiv.textContent = comment;
                    checkpoint.insertBefore(newCommentDiv, actionsDiv);
                }
            } else if (commentDiv) {
                commentDiv.remove(); // Если комментарий пустой, удаляем div
            }
            
            editForm.remove();
            actionsDiv.style.display = 'flex';
        } catch (error) {
            alert('Ошибка при сохранении комментария: ' + error.message);
        }
    });
}

// Сохранение комментария
async function saveComment(recordId, time, comment) {
    const response = await fetch(`/api/records/${recordId}/errors/comment`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ time, comment })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
    }

    return response.json();
}

async function deleteCheckpoint(mistakeId, element) {
    try {
        if (!mistakeId) {
            throw new Error('ID ошибки не определен');
        }

        console.log('Пытаемся удалить ошибку:', { mistakeId });

        // Удаляем ошибку по mistake_id
        const deleteResponse = await fetch(`/api/mistakes/${mistakeId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            throw new Error(`Ошибка при удалении ошибки: ${errorText}`);
        }

        // Удаляем элемент с экрана
        element.remove();

        // Удаляем соответствующий маркер ошибки
        const time = parseFloat(element.dataset.time);
        document.querySelectorAll('.error-marker').forEach(marker => {
            if (parseFloat(marker.dataset.timeOffset) === time) {
                marker.remove();
            }
        });

    } catch (error) {
        console.error('Ошибка при удалении ошибки:', error);
        alert('Ошибка при удалении ошибки: ' + error.message);
    }
}

// Сортировка чекпоинтов
function sortCheckpoints() {
    const items = Array.from(elements.checkpointsList.children);
    items.sort((a, b) => parseFloat(a.dataset.time) - parseFloat(b.dataset.time));
    elements.checkpointsList.append(...items);
}

// Обработка завершения записи
function processAudio() {
    clearInterval(frameInterval);
    isRecording = false;

    state.audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    audioChunks = [];

    const duration = performance.now() - recordingStartTime;
    totalDuration = duration;

    const reader = new FileReader();
    reader.onloadend = () => {
        const base64Audio = reader.result;
        sessionStorage.setItem('tempAudioData', base64Audio);
        sessionStorage.setItem('tempDuration', duration);
        sessionStorage.setItem('tempErrorTimestamps', JSON.stringify(errorTimestamps));
        sessionStorage.setItem('tempWaveformData', JSON.stringify(waveformData));
        
        switchPage('save');
        updateControls();
    };
    reader.readAsDataURL(state.audioBlob);
}

// Сохранение записи
async function saveRecording() {
    const recordName = state.recordName;
    let selectedFolder = state.selectedFolder;

    // Проверяем и конвертируем ID папки
    if (selectedFolder === 'default' || !selectedFolder) {
        // Получаем список папок и используем ID первой папки как папку по умолчанию
        try {
            const response = await fetch('/api/folders');
            const folders = await response.json();
            if (folders && folders.length > 0) {
                selectedFolder = folders[0].id;
            } else {
                throw new Error('Нет доступных папок');
            }
        } catch (error) {
            console.error('Ошибка при получении папок:', error);
            alert('Ошибка при получении папок: ' + error.message);
            return;
        }
    } else {
        // Преобразуем строковый ID в число
        selectedFolder = parseInt(selectedFolder);
    }

    if (!recordName.trim()) {
        alert('Введите название записи');
        return;
    }

    // Получаем данные из sessionStorage
    const base64Audio = sessionStorage.getItem('tempAudioData');
    const duration = parseFloat(sessionStorage.getItem('tempDuration'));
    const savedErrors = JSON.parse(sessionStorage.getItem('tempErrorTimestamps') || '[]');

    if (!base64Audio) {
        alert('Аудио данные отсутствуют');
        return;
    }

    try {
        const recordData = {
            name: recordName,
            folder: selectedFolder, // Теперь здесь всегда будет число
            audio: base64Audio,
            errors: savedErrors,
            duration: duration
        };

        const response = await fetch('/api/records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(recordData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка сервера ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        // Очищаем временные данные
        sessionStorage.removeItem('tempAudioData');
        sessionStorage.removeItem('tempDuration');
        sessionStorage.removeItem('tempErrorTimestamps');
        
        window.location.href = `/playback/${result.record_id}`;

    } catch (error) {
        console.error('Ошибка при сохранении записи:', error);
        alert('Ошибка при сохранении записи: ' + error.message);
    }
}

async function analyzeAudioFile(audioBlob) {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = async function() {
            try {
                const arrayBuffer = this.result;
                
                // Decode the audio data
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                // Get the audio data for processing
                const audioData = audioBuffer.getChannelData(0); // First channel
                const sampleRate = audioBuffer.sampleRate;
                const duration = audioBuffer.duration * 1000; // Convert to ms
                
                // Generate waveform data at regular intervals
                const totalBars = Math.floor(CONFIG.VISUALIZER_WIDTH / (CONFIG.BAR_WIDTH + CONFIG.BAR_GAP/2));
                const samplesPerBar = Math.floor(audioData.length / totalBars);
                
                const waveformResult = [];
                
                for (let i = 0; i < totalBars; i++) {
                    // Calculate the start and end index for this segment
                    const startIndex = i * samplesPerBar;
                    const endIndex = Math.min(startIndex + samplesPerBar, audioData.length);
                    
                    // Calculate average amplitude for this segment
                    let sum = 0;
                    for (let j = startIndex; j < endIndex; j++) {
                        // Convert from -1.0...1.0 to 0...1.0 range
                        sum += Math.abs(audioData[j]);
                    }
                    
                    const average = sum / (endIndex - startIndex);
                    
                    // Calculate time for this segment (in ms)
                    const time = (i / totalBars) * duration;
                    
                    // Add to waveform data - we'll simulate both input and output channels
                    // with the same data for simplicity
                    waveformResult.push({
                        input: average,
                        output: average,
                        time: time
                    });
                }
                
                resolve(waveformResult);
                
            } catch (error) {
                console.error('Error decoding audio:', error);
                reject(error);
            }
        };
        
        fileReader.onerror = function() {
            reject(new Error('Error reading audio file'));
        };
        
        fileReader.readAsArrayBuffer(audioBlob);
    });
}

// Подготовка воспроизведения
async function preparePlayback(recordId) {
    try {
        currentRecordId = recordId;
        const response = await fetch(`/api/records/${recordId}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка загрузки записи: ${errorText}`);
        }
        
        const recordData = await response.json();
        
        totalDuration = recordData.duration;
        playbackErrorTimestamps = recordData.playbackErrors.map(error => error.time);
        errorTimestamps = recordData.errors.map(error => error.time);

        // Remove reliance on previously stored waveform data
        // waveformData = JSON.parse(sessionStorage.getItem('tempWaveformData') || '[]');

        if (elements.checkpointsList) {
            elements.checkpointsList.innerHTML = '';
            recordData.errors.forEach(error => {
                addCheckpoint(
                    error.time,
                    'recording-error',
                    error.id,  // Use the actual mistake ID
                    error.comment
                );
            });
            recordData.playbackErrors.forEach(error => {
                addCheckpoint(
                    error.time,
                    'playback-error',
                    error.id,  // Use the actual mistake ID
                    error.comment
                );
            });
        }

        const audioBlob = await fetch(recordData.audio).then(r => r.blob());
        const audioUrl = URL.createObjectURL(audioBlob);
        audioElement = new Audio(audioUrl);

        // Initialize audio context and analyzer for playback
        if (!audioContext || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Create analyzers
        inputAnalyser = audioContext.createAnalyser();
        outputAnalyser = audioContext.createAnalyser();
        inputAnalyser.fftSize = 2048;
        outputAnalyser.fftSize = 2048;

        audioElement.addEventListener('loadedmetadata', () => {
            // Connect audio element to analyzers when it's loaded
            const source = audioContext.createMediaElementSource(audioElement);
            source.connect(inputAnalyser);  // We'll use this for analysis
            source.connect(audioContext.destination); // For actual playback
            
            // Pre-analyze the audio to generate the waveform
            analyzeAudioFile(audioBlob).then(waveformResult => {
                waveformData = waveformResult;
                renderPlayback();
                updateControls();
                if (elements.playbackTimer) {
                    elements.playbackTimer.innerHTML = `00:00 <span class="playback-timer-all">/ ${formatTime(totalDuration)}</span>`;
                }
            });
        });

        audioElement.addEventListener('timeupdate', () => {
            updatePlayback();
            updatePlaybackTimer();
        });

    } catch (error) {
        console.error('Ошибка при загрузке записи:', error);
        alert('Ошибка при загрузке записи: ' + error.message);
    }
}

// Рендер визуализатора воспроизведения
function renderPlayback() {
    if (!elements.playback) return;

    elements.playback.innerHTML = '<div id="center-line"></div>';
    
    const barWidth = CONFIG.BAR_WIDTH;
    const barGap = CONFIG.BAR_GAP / 2;
    const totalBars = Math.floor(CONFIG.VISUALIZER_WIDTH / (barWidth + barGap));
    const timePerBar = totalDuration / totalBars;
    
    for (let i = 0; i < totalBars; i++) {
        const barTime = i * timePerBar;
        const dataIndex = Math.floor((barTime / totalDuration) * waveformData.length);
        const dataPoint = waveformData[dataIndex] || {input: 0, output: 0};
        
        // Совмещаем оба источника
        const totalHeight = Math.min(
            (dataPoint.input * 255 * CONFIG.INPUT_SENSITIVITY + 
             dataPoint.output * 255 * CONFIG.OUTPUT_SENSITIVITY) * 0.9, 
            240
        );

        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.cssText = `
            height: ${totalHeight}px;
            width: ${barWidth}px;
            left: ${i * (barWidth + barGap)}px;
        `;
        elements.playback.appendChild(bar);
    }

    // Отрисовка маркеров ошибок (без изменений)
    errorTimestamps.forEach(timeOffset => {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-marker recording-error';
        errorElement.dataset.timeOffset = timeOffset;
        const position = (timeOffset / totalDuration) * CONFIG.VISUALIZER_WIDTH;
        errorElement.style.left = `${position}px`;
        elements.playback.appendChild(errorElement);
    });

    playbackErrorTimestamps.forEach(timeOffset => {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-marker playback-error';
        errorElement.dataset.timeOffset = timeOffset;
        const position = (timeOffset / totalDuration) * CONFIG.VISUALIZER_WIDTH;
        errorElement.style.left = `${position}px`;
        elements.playback.appendChild(errorElement);
    });

    if (elements.marker) elements.playback.appendChild(elements.marker);
}

// Переключение воспроизведения/паузы
async function togglePlayPause() {
    if (!audioElement) return;

    try {
        // Добавляем проверку состояния аудиоконтекста
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        if (audioElement.paused) {
            await audioElement.play();
            elements.playBtn.textContent = 'Пауза';
            updatePlaybackTimer();
            updatePlayback();
        } else {
            audioElement.pause();
            elements.playBtn.textContent = 'Воспроизвести';
        }
    } catch (error) {
        console.error('Ошибка воспроизведения:', error);
    }
}

// Обновление позиции маркера воспроизведения
function updatePlayback() {
    if (!audioElement || !elements.marker) return;

    const progress = (audioElement.currentTime * 1000 / totalDuration) * CONFIG.VISUALIZER_WIDTH;
    elements.marker.style.left = `${progress}px`;
    elements.marker.style.right = 'auto';
    
    if (!audioElement.paused) requestAnimationFrame(updatePlayback);
}

// Обработка клика по скробберу
function handleScrubberClick(e) {
    if (!audioElement || !elements.playback) return;

    const rect = elements.playback.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const newTime = (totalDuration / 1000) * clickPosition;
    audioElement.currentTime = newTime;

    updateErrorMarkersPosition();
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    
    if (mediaRecorder && mediaRecorder.stream) {
        const tracks = mediaRecorder.stream.getTracks();
        tracks.forEach(track => {
            track.stop();
        });
        console.log('All media tracks stopped, tab access released');
    }
    
    if (audioContext) {
        audioContext.close();
    }
    
    isRecording = false;
    clearInterval(frameInterval);
    updateControls();
}

// Обновление состояния кнопок
function updateControls() {
    if (elements.startBtn) elements.startBtn.disabled = isRecording;
    if (elements.stopBtn) elements.stopBtn.disabled = !isRecording;
    if (elements.errorBtn && isOwner) elements.errorBtn.disabled = !isRecording && !audioElement;
    if (elements.playBtn) elements.playBtn.disabled = !audioElement;
}

document.addEventListener('DOMContentLoaded', init);