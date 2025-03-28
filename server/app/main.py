from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
import httpx
import os
import uvicorn
from dotenv import load_dotenv
from pathlib import Path
import logging

# Настраиваем логирование
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Загружаем переменные окружения
load_dotenv()

# Инициализируем FastAPI приложение
app = FastAPI(title="Realtime API")


@app.get("/api/session")
async def create_session():
    """
    Создает новую сессию с OpenAI Realtime API и возвращает эфемерный токен
    """
    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.error("API key not found in environment variables")
            raise HTTPException(
                status_code=500, detail={"error": "API key not configured"}
            )

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
                    "OpenAI-Beta": "realtime=v1",  # Добавляем требуемый заголовок
                },
                json=request_data,
            )

            response_data = response.json()
            logger.info(f"Response from OpenAI: {response_data}")

            if response.status_code != 200:
                logger.error(f"Error from OpenAI: {response_data}")
                raise HTTPException(
                    status_code=response.status_code, detail=response_data
                )

            return response_data

    except Exception as e:
        logger.error(f"Server error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Internal server error", "message": str(e)},
        )


# Монтируем статические файлы после определения всех API маршрутов
static_path = Path(__file__).parent.parent.parent / "public"
app.mount("/", StaticFiles(directory=static_path, html=True), name="static")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)
