import uvicorn
from pathlib import Path
from app.config import settings

if __name__ == "__main__":
    cert_dir = Path(__file__).parent / "certs"

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        ssl_keyfile=str(cert_dir / "key.pem"),
        ssl_certfile=str(cert_dir / "cert.pem"),
        ws_max_size=16777216,  # 16MB для WebSocket сообщений
        ws_ping_interval=20,  # Пинг каждые 20 секунд
        ws_ping_timeout=20,  # Таймаут пинга 20 секунд
    )
