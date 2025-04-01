import httpx
from fastapi import HTTPException
from app.logger import logger
from app.config import settings, read_instructions


async def create_openai_session():
    if not settings.api_key:
        logger.error("API key not found in environment variables")
        raise HTTPException(status_code=500, detail={"error": "API key not configured"})

    instructions = read_instructions()
    if instructions != "":
        logger.info("Loaded instructions from file")

    async with httpx.AsyncClient() as client:
        request_data = {
            "model": settings.model,
            "voice": settings.voice,
            "temperature": settings.temperature,
            "instructions": instructions,
        }

        response = await client.post(
            "https://api.openai.com/v1/realtime/sessions",
            headers={
                "Authorization": f"Bearer {settings.api_key}",
                "Content-Type": "application/json",
                "OpenAI-Beta": "realtime=v1",
            },
            json=request_data,
        )

        response_data = response.json()
        logger.info("Successfully created OpenAI session")

        if response.status_code != 200:
            logger.error("Error from OpenAI API")
            raise HTTPException(
                status_code=response.status_code, detail={"error": "OpenAI API error"}
            )

        return response_data
