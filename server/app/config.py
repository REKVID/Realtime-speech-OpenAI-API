from dotenv import load_dotenv
from pydantic_settings import BaseSettings
from pathlib import Path
from app.logger import logger

load_dotenv()


class Settings(BaseSettings):
    # OpenAI
    api_key: str = ""
    model: str = "gpt-4o-mini-realtime-preview-2024-12-17"
    voice: str = "verse"
    temperature: float = 0.9
    instructions_path: Path = Path(__file__).parent.parent / "instruction.txt"

    # Server
    host: str = "0.0.0.0"
    port: int = 3000
    max_sessions: int = 5

    class Config:
        env_prefix = "OPENAI_"


settings = Settings()


def read_instructions() -> str:
    try:
        with open(settings.instructions_path, "r", encoding="utf-8") as file:
            return file.read().strip()
    except Exception as e:
        logger.error(f"Error reading instructions file: {e}")
        return ""
