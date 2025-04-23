// Обработка действий с папками (редактирование, удаление)
document.addEventListener('DOMContentLoaded', function() {
    // Находим все кнопки редактирования и удаления
    const editButtons = document.querySelectorAll('.edit-folder');
    const deleteButtons = document.querySelectorAll('.delete-folder');
    
    // Добавляем обработчики для кнопок редактирования
    editButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation(); // Предотвращаем всплытие события
            const folderId = this.dataset.folderId;
            const folderItem = this.closest('.folder-item');
            const folderNameElement = folderItem.querySelector('.folder-name');
            const currentName = folderNameElement.textContent.trim();
            
            // Показываем форму редактирования
            showEditForm(folderItem, folderNameElement, folderId, currentName);
        });
    });
    
    // Добавляем обработчики для кнопок удаления
    deleteButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation(); // Предотвращаем всплытие события
            const folderId = this.dataset.folderId;
            const folderItem = this.closest('.folder-item');
            const folderName = folderItem.querySelector('.folder-name').textContent.trim();
            
            // Специальное сообщение для подтверждения
            const confirmMessage = 'Вы уверены, что хотите удалить папку "' + folderName + '"? ' +
                                'Все записи из этой папки будут перемещены в Корзину.';
            
            if (confirm(confirmMessage)) {
                deleteFolder(folderId);
            }
        });
    });
});

// Функция для отображения формы редактирования
function showEditForm(folderItem, folderNameElement, folderId, currentName) {
    // Создаем форму редактирования
    const editForm = document.createElement('div');
    editForm.className = 'folder-edit-form';
    editForm.innerHTML = `
        <input type="text" value="${currentName}" placeholder="Введите новое имя папки">
        <div class="actions">
            <button class="cancel-folder-edit">Отмена</button>
            <button class="save-folder-name">Сохранить</button>
        </div>
    `;
    
    // Скрываем имя папки
    folderNameElement.parentElement.style.display = 'none';
    
    // Скрываем кнопки действий
    const actionsDiv = folderItem.querySelector('.folder-actions');
    actionsDiv.style.display = 'none';
    
    // Добавляем класс редактирования к элементу папки
    folderItem.classList.add('editing');
    
    // Добавляем форму непосредственно в folder-item
    folderItem.appendChild(editForm);
    
    // Фокусируем на поле ввода
    const input = editForm.querySelector('input');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    
    // Предотвращаем всплытие событий для формы
    editForm.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Обработчик для кнопки отмены
    const cancelButton = editForm.querySelector('.cancel-folder-edit');
    cancelButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editForm.remove();
        folderNameElement.parentElement.style.display = '';
        actionsDiv.style.display = '';
        
        // Удаляем класс редактирования
        folderItem.classList.remove('editing');
    });
    
    // Обработчик для кнопки сохранения
    const saveButton = editForm.querySelector('.save-folder-name');
    saveButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const newName = input.value.trim();
        if (newName) {
            renameFolder(folderId, newName)
                .then(() => {
                    // Обновляем отображаемое имя
                    folderNameElement.textContent = newName;
                    
                    // Восстанавливаем исходное состояние
                    editForm.remove();
                    folderNameElement.parentElement.style.display = '';
                    actionsDiv.style.display = '';
                    
                    // Удаляем класс редактирования
                    folderItem.classList.remove('editing');
                })
                .catch(error => {
                    alert('Ошибка при переименовании папки: ' + error.message);
                });
        } else {
            alert('Имя папки не может быть пустым');
        }
    });
    
    // Обработка нажатия Enter для сохранения
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveButton.click();
        }
    });
}

// Функция для переименования папки
async function renameFolder(folderId, newName) {
    const response = await fetch(`/api/folders/${folderId}/rename`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
    }
    
    return response.json();
}

// Функция для удаления папки
async function deleteFolder(folderId) {
    try {
        const response = await fetch(`/api/folders/${folderId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }
        
        const result = await response.json();
        
        // Показываем сообщение о перемещенных файлах
        if (result.moved_files > 0) {
            const filesWord = getFilesWord(result.moved_files);
            alert(`Папка успешно удалена. ${result.moved_files} ${filesWord} перемещено в Корзину.`);
        } else {
            alert('Папка успешно удалена.');
        }
        
        // Перезагружаем страницу после успешного удаления
        window.location.reload();
    } catch (error) {
        console.error('Ошибка при удалении папки:', error);
        alert('Ошибка при удалении папки: ' + error.message);
    }
}

// Функция для правильного склонения слова "файл"
function getFilesWord(count) {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    
    if (lastDigit === 1 && lastTwoDigits !== 11) {
        return 'файл';
    } else if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) {
        return 'файла';
    } else {
        return 'файлов';
    }
}