"""
Модуль настройки логирования.

Предоставляет функционал для настройки и использования логгера в приложении.

Attributes:
    logger (Logger): Глобальный объект логгера для приложения
"""

import logging

logger = logging.getLogger("RealtimeAPI")


def setup_logging():
    """
    Настраивает базовую конфигурацию логирования.

    Устанавливает уровень логирования INFO и выводит сообщение о успешной настройке.
    """
    logging.basicConfig(level=logging.INFO)
    logger.info("Logging is set up.")
