"""
Основной модуль FastAPI приложения.

Этот модуль инициализирует FastAPI приложение, настраивает маршруты
и статические файлы.

Attributes:
    app (FastAPI): Экземпляр FastAPI приложения
    static_path (Path): Путь к директории со статическими файлами
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.session import router as session_router
from app.config import Config
from pathlib import Path

from app.utils.logger import setup_logging

# Настраиваем логирование
setup_logging()

# Инициализируем FastAPI приложение
app = FastAPI(title="Realtime API")

# Подключаем маршруты
app.include_router(session_router)

# Монтируем статические файлы после определения всех API маршрутов
static_path = Path(__file__).parent.parent.parent / "public"
app.mount("/", StaticFiles(directory=static_path, html=True), name="static")
