// Обработка действий с записями (редактирование, удаление)
document.addEventListener('DOMContentLoaded', function() {
    // Находим все кнопки редактирования и удаления
    const editButtons = document.querySelectorAll('.edit-record');
    const deleteButtons = document.querySelectorAll('.delete-record');
    
    // Добавляем обработчики для кнопок редактирования
    editButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation(); // Предотвращаем всплытие события
            const recordId = this.dataset.recordId;
            const recordItem = this.closest('.record-item');
            const recordNameElement = recordItem.querySelector('.record-name');
            const currentName = recordNameElement.textContent.trim();
            
            // Показываем форму редактирования
            showEditForm(recordItem, recordNameElement, recordId, currentName);
        });
    });
    
    // Добавляем обработчики для кнопок удаления
    deleteButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation(); // Предотвращаем всплытие события
            const recordId = this.dataset.recordId;
            const isTrash = this.dataset.isTrash === 'true';
            
            if (isTrash) {
                // Если запись уже в корзине, предлагаем полностью удалить
                if (confirm('Вы уверены, что хотите полностью удалить эту запись? Это действие невозможно отменить.')) {
                    deleteRecord(recordId);
                }
            } else {
                // Если запись не в корзине, перемещаем в корзину
                if (confirm('Переместить запись в корзину?')) {
                    moveToTrash(recordId);
                }
            }
        });
    });
});

// Функция для отображения формы редактирования
function showEditForm(recordItem, recordNameElement, recordId, currentName) {
    // Создаем форму редактирования
    const editForm = document.createElement('div');
    editForm.className = 'record-edit-form';
    editForm.innerHTML = `
        <input type="text" value="${currentName}" placeholder="Введите название записи">
        <div class="actions">
            <button class="cancel-record-edit">Отмена</button>
            <button class="save-record-name">Сохранить</button>
        </div>
    `;
    
    // Скрываем имя записи
    recordNameElement.style.display = 'none';
    
    // Скрываем ссылку на запись
    const recordLink = recordItem.querySelector('.record-link');
    recordLink.style.display = 'none';
    
    // Скрываем кнопки действий
    const actionsDiv = recordItem.querySelector('.record-actions');
    actionsDiv.style.display = 'none';
    
    // Добавляем форму непосредственно в record-item вместо добавления в элемент ссылки
    recordItem.appendChild(editForm);
    
    // Фокусируем на поле ввода
    const input = editForm.querySelector('input');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    
    // Предотвращаем всплытие событий для формы
    editForm.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Обработчик для кнопки отмены
    const cancelButton = editForm.querySelector('.cancel-record-edit');
    cancelButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editForm.remove();
        recordNameElement.style.display = '';
        recordLink.style.display = '';
        actionsDiv.style.display = '';
    });
    
    // Обработчик для кнопки сохранения
    const saveButton = editForm.querySelector('.save-record-name');
    saveButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const newName = input.value.trim();
        if (newName) {
            renameRecord(recordId, newName)
                .then(() => {
                    // Обновляем отображаемое имя
                    recordNameElement.textContent = newName;
                    
                    // Восстанавливаем исходное состояние
                    editForm.remove();
                    recordNameElement.style.display = '';
                    recordLink.style.display = '';
                    actionsDiv.style.display = '';
                })
                .catch(error => {
                    alert('Ошибка при переименовании записи: ' + error.message);
                });
        } else {
            alert('Название записи не может быть пустым');
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

// Функция для переименования записи
async function renameRecord(recordId, newName) {
    const response = await fetch(`/api/records/${recordId}/rename`, {
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

// Функция для перемещения записи в корзину
async function moveToTrash(recordId) {
    try {
        const response = await fetch(`/api/records/${recordId}/trash`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }
        
        // Перезагружаем страницу после успешного перемещения
        window.location.reload();
    } catch (error) {
        console.error('Ошибка при перемещении в корзину:', error);
        alert('Ошибка при перемещении в корзину: ' + error.message);
    }
}

// Функция для полного удаления записи
async function deleteRecord(recordId) {
    try {
        const response = await fetch(`/api/records/${recordId}/delete`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }
        
        // Перезагружаем страницу после успешного удаления
        window.location.reload();
    } catch (error) {
        console.error('Ошибка при удалении записи:', error);
        alert('Ошибка при удалении записи: ' + error.message);
    }
} 