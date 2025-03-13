
import os

basedir = os.path.abspath(os.path.dirname(__file__))

class Config:
    # Здесь Flask будет брать SECRET_KEY из переменной окружения, а если её нет, использовать "fallback-secret-key"
    SECRET_KEY = os.environ.get("SECRET_KEY", "fallback-secret-key")
    SQLALCHEMY_DATABASE_URI = "sqlite:///" + os.path.join(basedir, "site.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

