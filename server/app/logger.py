import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path
import datetime

# Создаем логгер для нашего приложения
logger = logging.getLogger("RealtimeAPI")


def setup_logging(
    log_level=logging.INFO, enable_console=True, log_to_file=True, log_dir=None
):
    """
    Настраивает логирование для приложения.

    Args:
        log_level: Уровень логирования (по умолчанию INFO)
        enable_console: Выводить логи в консоль
        log_to_file: Сохранять логи в файл
        log_dir: Директория для хранения логов (по умолчанию /logs в корне проекта)
    """
    # Сбрасываем существующие обработчики, если они есть
    if logger.handlers:
        for handler in logger.handlers:
            logger.removeHandler(handler)

    # Устанавливаем уровень логирования
    logger.setLevel(log_level)

    # Создаем форматтер для логов
    log_format = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Настраиваем вывод в консоль
    if enable_console:
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(log_format)
        console_handler.setLevel(log_level)
        logger.addHandler(console_handler)

    # Настраиваем сохранение в файл
    if log_to_file:
        if log_dir is None:
            # Если директория не указана, используем logs в корне проекта
            log_dir = Path(__file__).parent.parent / "logs"

        # Создаем директорию, если её нет
        os.makedirs(log_dir, exist_ok=True)

        # Имя файла лога текущей даты
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        log_file = os.path.join(log_dir, f"realtime_api_{today}.log")

        # Создаем обработчик с ротацией файлов (максимум 10 МБ, до 5 файлов)
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,  # 10 МБ
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(log_format)
        file_handler.setLevel(log_level)
        logger.addHandler(file_handler)

    logger.info("Логирование настроено успешно.")
    if log_to_file:
        logger.info(f"Логи сохраняются в: {log_dir}")
