from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.session import router as session_router
from pathlib import Path
from dotenv import load_dotenv
import logging
import os
from contextlib import asynccontextmanager

from app.logger import setup_logging, logger

# Настраиваем логирование с сохранением в файл
log_level = os.getenv("LOG_LEVEL", "INFO")
log_level_value = getattr(logging, log_level.upper(), logging.INFO)
setup_logging(
    log_level=log_level_value,
    enable_console=False,
    log_to_file=True,
)

load_dotenv()

logging.getLogger("uvicorn.access").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Запуск приложения Realtime API")
    logger.info(
        f"Статические файлы будут обслуживаться из: {Path(__file__).parent.parent.parent / 'public'}"
    )
    yield
    logger.info("Завершение работы приложения")


app = FastAPI(
    title="Realtime API",
    lifespan=lifespan,
)

app.include_router(session_router)

# Монтируем статические файлы после определения всех API маршрутов
static_path = Path(__file__).parent.parent.parent / "public"
app.mount("/", StaticFiles(directory=static_path, html=True), name="static")
