"""
Модуль управления сессиями.

Содержит маршруты FastAPI для создания и управления сессиями OpenAI.

Attributes:
    router (APIRouter): Маршрутизатор FastAPI для endpoints сессий
"""

from fastapi import APIRouter, HTTPException
from app.openai_service import create_openai_session

router = APIRouter()


@router.get("/api/session")
async def create_session():
    """
    Создает новую сессию с OpenAI Realtime API.

    Returns:
        dict: Данные сессии от OpenAI API

    Raises:
        HTTPException: При возникновении ошибок в процессе создания сессии
    """
    try:
        return await create_openai_session()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Internal server error", "message": str(e)},
        )
