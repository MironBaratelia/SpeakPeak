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
            const folderNameElement = folderItem.querySelector('.folder-link');
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
            
            if (confirm('Вы уверены, что хотите удалить эту папку? Это действие невозможно отменить.')) {
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
    folderNameElement.style.display = 'none';
    
    // Скрываем кнопки действий
    const actionsDiv = folderItem.querySelector('.folder-actions');
    actionsDiv.style.display = 'none';
    
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
        folderNameElement.style.display = '';
        actionsDiv.style.display = '';
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
                    folderNameElement.style.display = '';
                    actionsDiv.style.display = '';
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
    const response = await fetch(`/api/folders/${folderId}`, {
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
        
        // Удаляем папку из DOM
        document.querySelector(`.folder-item[data-folder-id="${folderId}"]`).remove();
    } catch (error) {
        console.error('Ошибка при удалении папки:', error);
        alert('Ошибка при удалении папки: ' + error.message);
    }
}