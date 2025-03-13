from app import create_app
from models import db, User, Folder, Record, Mistake
from datetime import datetime

# Создаем приложение Flask
app = create_app()

# Используем контекст приложения для работы с базой данных
with app.app_context():
    # Удаляем все таблицы (опционально, если нужно очистить базу)
    db.drop_all()

    # Создаем все таблицы заново
    db.create_all()

    # Пример добавления тестовых данных
    user = User(
        first_name="John",
        last_name="Doe",
        login="john_doe",
    )
    user.set_password("password123")  # Хэшируем пароль
    db.session.add(user)
    db.session.commit()

    # Создаем папку для пользователя
    folder = Folder(name="My Folder", user_id=user.id)
    db.session.add(folder)
    db.session.commit()

    # Создаем запись в папке
    record = Record(
        user_id=user.id,
        id_folder=folder.id,
        trash=0,
        length=120.5,
        audio_file="path/to/audio.mp3",
        datetime=datetime.utcnow()
    )
    db.session.add(record)
    db.session.commit()

    # Создаем ошибку для записи
    mistake = Mistake(
        record_id=record.id,
        comment="Wrong pronunciation",
        time_of_mistake=10.5,
        type=1
    )
    db.session.add(mistake)
    db.session.commit()

    print("База данных и тестовые данные успешно созданы!")