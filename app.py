from flask import Flask, render_template, redirect, url_for, flash, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, current_user, logout_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from forms import RegistrationForm, LoginForm
import os
import base64

# Инициализация Flask и расширений
app = Flask(__name__)
app.config['SECRET_KEY'] = 'd2f8a8b1c4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'static/uploads'  # Добавляем конфигурацию для папки загрузок

# Создаем папку для загрузок, если она не существует
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'  # Указываем страницу входа

# Модель пользователя
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    login = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    folders = db.relationship("Folder", backref="user", lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# Модель папки
class Folder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    records = db.relationship("Record", backref="folder", lazy=True)

class Record(db.Model):
    __tablename__ = "record"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    id_folder = db.Column(db.Integer, db.ForeignKey("folder.id"), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    trash = db.Column(db.Integer, default=0, nullable=False)
    length = db.Column(db.Float, nullable=True)
    audio_file = db.Column(db.String(255), nullable=True)
    datetime = db.Column(db.DateTime, default=datetime.utcnow)

    # Связь с таблицей Mistake (один ко многим)
    mistakes = db.relationship("Mistake", backref="record", lazy=True, cascade="all, delete-orphan")

class Mistake(db.Model):
    __tablename__ = "mistake"
    id = db.Column(db.Integer, primary_key=True)
    record_id = db.Column(db.Integer, db.ForeignKey("record.id"), nullable=False)
    comment = db.Column(db.String(255), nullable=True)
    time_of_mistake = db.Column(db.Float, nullable=True)
    type = db.Column(db.Integer, nullable=True)

# Загрузка пользователя для Flask-Login
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Главная страница
@app.route("/")
def index():
    return render_template("index.html", user=current_user)

# Страница записи
@app.route("/record")
@login_required
def record():
    return render_template("record.html", user=current_user)

# Страница сохранения
@app.route("/save")
@login_required
def save():
    return render_template("save.html", user=current_user)

# Страница воспроизведения
@app.route("/playback/<int:record_id>")
def playback(record_id):
    record = Record.query.get_or_404(record_id)
    # Проверяем, является ли текущий пользователь владельцем записи
    is_owner = current_user.is_authenticated and record.user_id == current_user.id
    return render_template("playback.html", 
                         user=current_user, 
                         record_id=record_id,
                         is_owner=is_owner)

@app.route('/folder/<int:folder_id>')
@login_required
def folder(folder_id):
    folder = Folder.query.get_or_404(folder_id)
    if folder.user_id != current_user.id:
        flash('Доступ запрещен', 'danger')
        return redirect(url_for('index'))
    
    # Получаем записи и группируем их по датам
    records = Record.query.filter_by(id_folder=folder_id).all()
    records_by_date = {}
    
    for record in records:
        if not hasattr(record, 'name') or not record.name:
            record.name = os.path.splitext(os.path.basename(record.audio_file))[0]
        
        date = record.datetime.strftime('%d.%m.%Y')
        if date not in records_by_date:
            records_by_date[date] = []
        records_by_date[date].append(record)
    
    # Сортируем даты в обратном порядке (новые записи сверху)
    sorted_dates = sorted(records_by_date.keys(), reverse=True)
    
    return render_template('folder.html', 
                         folder=folder, 
                         user=current_user,
                         records_by_date=records_by_date,
                         sorted_dates=sorted_dates)

@app.route('/add_folder')
@login_required
def add_folder():
    folders = Folder.query.filter_by(user_id=current_user.id).all()
    return render_template('add_folder.html', user=current_user)

@app.route('/create_folder', methods=['GET', 'POST'])
@login_required
def create_folder():
    if request.method == 'POST':
        # Логика для создания папки
        folder_name = request.form.get('folder_name')
        if folder_name:
            new_folder = Folder(name=folder_name, user_id=current_user.id)
            db.session.add(new_folder)
            db.session.commit()
            return redirect(url_for('folder', folder_id=new_folder.id))
        else:
            flash('Название папки не может быть пустым', 'danger')
            return redirect(url_for('add_folder'))
    else:
        # Если метод GET, перенаправляем на страницу создания папки
        return redirect(url_for('add_folder'))

# Регистрация
@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    form = RegistrationForm()
    
    if form.validate_on_submit():
        first_name = form.first_name.data
        last_name = form.last_name.data
        login = form.login.data
        password = form.password.data
        
        existing_user = User.query.filter_by(login=login).first()
        if existing_user:
            flash('Пользователь с таким логином уже существует.', 'danger')
            return render_template('register.html', form=form)
            
        user = User(
            first_name=first_name,
            last_name=last_name,
            login=login,
        )
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        folder = Folder(name="Черновики", user_id=user.id)
        db.session.add(folder)
        
        folder = Folder(name="Корзина", user_id=user.id)
        db.session.add(folder)
        db.session.commit()

        login_user(user)

        flash('Регистрация прошла успешно! Вы вошли в систему.', 'success')
        return redirect(url_for('index'))
    
    return render_template('register.html', form=form)

# Вход
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    form = LoginForm()
    
    if form.validate_on_submit():
        login = form.login.data
        password = form.password.data
        
        user = User.query.filter_by(login=login).first()
        if user and user.check_password(password):
            login_user(user)
            flash('Вы успешно вошли!', 'success')
            return redirect(url_for('index'))
        else:
            flash('Ошибка входа. Проверьте логин и пароль', 'danger')
    
    return render_template('login.html', form=form)

# Выход
@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Вы вышли из системы.', 'success')
    return redirect(url_for('index'))

# API для сохранения записи
@app.route("/api/records", methods=["POST"])
@login_required
def save_record():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Нет данных"}), 400
            
        record_name = data.get("name")
        folder_id = int(data.get("folder"))
        audio_base64 = data.get("audio")
        duration = data.get("duration")
        errors = data.get("errors", [])
        
        if not all([record_name, folder_id, audio_base64, duration is not None]):
            return jsonify({"error": "Не все обязательные поля заполнены"}), 400
        
        # Проверка существования папки и доступа к ней
        folder = Folder.query.get(folder_id)
        if not folder or folder.user_id != current_user.id:
            return jsonify({"error": "Папка не найдена или доступ запрещен"}), 404
        
        # Проверяем правильность формата base64
        try:
            # Убедимся, что строка правильно разделена
            if ',' in audio_base64:
                audio_data = base64.b64decode(audio_base64.split(',')[1])
            else:
                audio_data = base64.b64decode(audio_base64)
        except Exception as e:
            app.logger.error(f"Ошибка декодирования base64: {str(e)}")
            return jsonify({"error": f"Ошибка формата аудио: {str(e)}"}), 400
        
        # Создаем папку для загрузок, если она не существует
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        
        audio_filename = f"{record_name}_{current_user.id}_{int(datetime.utcnow().timestamp())}.wav"
        audio_path = os.path.join(app.config['UPLOAD_FOLDER'], audio_filename)
        
        # Сохраняем файл
        try:
            with open(audio_path, "wb") as f:
                f.write(audio_data)
        except Exception as e:
            app.logger.error(f"Ошибка при сохранении файла: {str(e)}")
            return jsonify({"error": f"Ошибка при сохранении файла: {str(e)}"}), 500
        
        # Создаем запись в базе данных
        new_record = Record(
            user_id=current_user.id,
            id_folder=folder_id,
            name=record_name,
            length=duration / 1000,  # Преобразуем миллисекунды в секунды
            audio_file=audio_filename
        )
        db.session.add(new_record)
        db.session.flush()  # Получаем ID записи
        
        # Сохраняем ошибки
        for error_time in errors:
            mistake = Mistake(
                record_id=new_record.id,
                time_of_mistake=error_time / 1000,  # Преобразуем миллисекунды в секунды
                type=1  # По умолчанию тип 1, можно изменить
            )
            db.session.add(mistake)
        
        db.session.commit()
        return jsonify({"success": True, "record_id": new_record.id})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Ошибка при сохранении записи: {str(e)}")
        return jsonify({"error": f"Ошибка при сохранении записи: {str(e)}"}), 500

# API для получения одной записи
@app.route("/api/records/<int:record_id>", methods=["GET"])
def get_record(record_id):
    try:
        record = Record.query.get_or_404(record_id)
        
        # Путь к аудиофайлу
        audio_path = os.path.join(app.config['UPLOAD_FOLDER'], record.audio_file)
        
        # Проверка существования файла
        if not os.path.exists(audio_path):
            return jsonify({"error": "Аудиофайл не найден"}), 404
        
        # Чтение аудиофайла и преобразование в base64
        with open(audio_path, "rb") as f:
            audio_data = f.read()
        
        audio_base64 = f"data:audio/wav;base64,{base64.b64encode(audio_data).decode('utf-8')}"
        
        # Получение ошибок с комментариями
        mistakes = Mistake.query.filter_by(record_id=record_id).all()
        errors = [{
            'time': mistake.time_of_mistake * 1000,
            'comment': mistake.comment
        } for mistake in mistakes if mistake.type == 1]
        
        playback_errors = [{
            'time': mistake.time_of_mistake * 1000,
            'comment': mistake.comment
        } for mistake in mistakes if mistake.type == 2]
        
        record_data = {
            "id": record.id,
            "name": record.name,
            "folder": record.id_folder,
            "audio": audio_base64,
            "duration": record.length * 1000,
            "errors": errors,
            "playbackErrors": playback_errors
        }
        
        return jsonify(record_data)
    except Exception as e:
        app.logger.error(f"Ошибка при получении записи: {str(e)}")
        return jsonify({"error": f"Ошибка при получении записи: {str(e)}"}), 500

# API для добавления ошибки воспроизведения
@app.route("/api/records/<int:record_id>/errors", methods=["POST"])
@login_required
def add_error(record_id):
    try:
        record = Record.query.get_or_404(record_id)
        
        # Проверка доступа
        if record.user_id != current_user.id:
            return jsonify({"error": "Доступ запрещен"}), 403
        
        data = request.json
        error_time = data.get("time")
        
        if error_time is None:
            return jsonify({"error": "Время ошибки не указано"}), 400
        
        mistake = Mistake(
            record_id=record_id,
            time_of_mistake=error_time / 1000,  # Преобразуем миллисекунды в секунды
            type=2  # Тип 2 для ошибок воспроизведения
        )
        db.session.add(mistake)
        db.session.commit()
        
        return jsonify({"success": True, "mistake_id": mistake.id})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

# API для удаления ошибки
@app.route("/api/mistakes/<int:mistake_id>", methods=["DELETE"])
@login_required
def delete_mistake(mistake_id):
    try:
        mistake = Mistake.query.get_or_404(mistake_id)
        record = Record.query.get(mistake.record_id)
        
        # Проверка доступа
        if record.user_id != current_user.id:
            return jsonify({"error": "Доступ запрещен"}), 403
        
        db.session.delete(mistake)
        db.session.commit()
        
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Ошибка при удалении ошибки: {str(e)}")
        return jsonify({"error": f"Ошибка при удалении ошибки: {str(e)}"}), 500

# API для получения папок
@app.route("/api/folders", methods=["GET"])
@login_required
def get_folders():
    try:
        folders = Folder.query.filter_by(user_id=current_user.id).all()
        folders_data = [{"id": folder.id, "name": folder.name} for folder in folders]
        return jsonify(folders_data)
    except Exception as e:
        app.logger.error(f"Ошибка при получении папок: {str(e)}")
        return jsonify({"error": f"Ошибка при получении папок: {str(e)}"}), 500

@app.route('/init_folders')
def init_folders():
    try:
        # Создаем папку "Черновики" для каждого пользователя, у которого её нет
        users = User.query.all()
        for user in users:
            if not Folder.query.filter_by(user_id=user.id, name="Черновики").first():
                drafts_folder = Folder(name="Черновики", user_id=user.id)
                db.session.add(drafts_folder)
        
        db.session.commit()
        return jsonify({"message": "Папки успешно созданы"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/init_test_user')
def init_test_user():
    try:
        # Создаем тестового пользователя, если его нет
        if not User.query.filter_by(login="test").first():
            test_user = User(
                first_name="Test",
                last_name="User",
                login="test"
            )
            test_user.set_password("test123")
            db.session.add(test_user)
            db.session.commit()

            # Создаем папку "Черновики" для тестового пользователя
            drafts_folder = Folder(name="Черновики", user_id=test_user.id)
            db.session.add(drafts_folder)
            db.session.commit()

        return jsonify({"message": "Тестовый пользователь создан"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

# API для обновления комментария к ошибке
@app.route("/api/records/<int:record_id>/errors/comment", methods=["POST"])
@login_required
def update_error_comment(record_id):
    try:
        record = Record.query.get_or_404(record_id)
        
        # Проверка доступа
        if record.user_id != current_user.id:
            return jsonify({"error": "Доступ запрещен"}), 403
        
        data = request.json
        time = data.get("time")
        comment = data.get("comment", "").strip()
        
        if time is None:
            return jsonify({"error": "Время ошибки не указано"}), 400
        
        # Ищем ошибку по времени
        mistake = Mistake.query.filter_by(
            record_id=record_id,
            time_of_mistake=time/1000  # Конвертируем в секунды
        ).first()
        
        if not mistake:
            return jsonify({"error": "Ошибка не найдена"}), 404
        
        mistake.comment = comment  # Сохраняем пустую строку вместо None
        db.session.commit()
        
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/settings')
@login_required
def settings():
    return render_template('settings.html', user=current_user)

@app.route('/settings/profile', methods=['GET', 'POST'])
@login_required
def profile_settings():
    if request.method == 'POST':
        first_name = request.form.get('first_name')
        last_name = request.form.get('last_name')
        
        if not first_name or not last_name:
            flash('Все поля должны быть заполнены', 'danger')
            return redirect(url_for('profile_settings'))
        
        try:
            current_user.first_name = first_name
            current_user.last_name = last_name
            db.session.commit()
            flash('Данные успешно обновлены', 'success')
        except Exception as e:
            db.session.rollback()
            flash('Ошибка при обновлении данных', 'danger')
            
    return render_template('profile_settings.html', user=current_user)

@app.route('/settings/password', methods=['GET', 'POST'])
@login_required
def password_settings():
    if request.method == 'POST':
        current_password = request.form.get('current_password')
        new_password = request.form.get('new_password')
        confirm_password = request.form.get('confirm_password')
        
        if not all([current_password, new_password, confirm_password]):
            flash('Все поля должны быть заполнены', 'danger')
            return redirect(url_for('password_settings'))
            
        if not current_user.check_password(current_password):
            flash('Неверный текущий пароль', 'danger')
            return redirect(url_for('password_settings'))
            
        if new_password != confirm_password:
            flash('Новые пароли не совпадают', 'danger')
            return redirect(url_for('password_settings'))
            
        try:
            current_user.set_password(new_password)
            db.session.commit()
            flash('Пароль успешно изменен', 'success')
        except Exception as e:
            db.session.rollback()
            flash('Ошибка при изменении пароля', 'danger')
            
    return render_template('password_settings.html', user=current_user)

# Запуск приложения
if __name__ == "__main__":
    app.run(debug=True)
    