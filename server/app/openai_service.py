import os
import httpx
from fastapi import HTTPException
from app.utils.logger import logger

"""
Модуль для взаимодействия с OpenAI API.

Этот модуль содержит функции для создания и управления сессиями OpenAI.
"""


async def create_openai_session():
    """
    Создает новую сессию с OpenAI API.

    Returns:
        dict: Данные ответа от OpenAI API, включая токен сессии

    Raises:
        HTTPException: Если произошла ошибка при создании сессии или отсутствует API ключ
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("API key not found in environment variables")
        raise HTTPException(status_code=500, detail={"error": "API key not configured"})

    async with httpx.AsyncClient() as client:
        request_data = {
            "model": "gpt-4o-realtime-preview-2024-12-17",
            "voice": "verse",
            "instructions": "You are a helpful AI assistant. Always respond in Russian language. Use a natural, conversational Russian speaking style.",
        }

        logger.info(f"Sending request to OpenAI with data: {request_data}")

        response = await client.post(
            "https://api.openai.com/v1/realtime/sessions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "OpenAI-Beta": "realtime=v1",
            },
            json=request_data,
        )

        response_data = response.json()
        logger.info(f"Response from OpenAI: {response_data}")

        if response.status_code != 200:
            logger.error(f"Error from OpenAI: {response_data}")
            raise HTTPException(status_code=response.status_code, detail=response_data)

        return response_data
