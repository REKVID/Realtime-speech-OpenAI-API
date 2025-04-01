from fastapi import (
    APIRouter,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from app.openai_service import create_openai_session
import json
import uuid
from app.logger import logger
from typing import TypedDict  #  НЕ ВЫЕБЫВАТЬСЯ ЗАМЕНЫ НЕТ

router = APIRouter()


# Типизация
class SessionData(TypedDict):
    data: dict
    is_active: bool


# Хранилище активных сессий
active_sessions: dict[str, SessionData] = {}


@router.get("/api/session")
async def create_session():
    """Создает новую сессию и возвращает данные для инициализации WebRTC."""
    try:
        session_id = str(uuid.uuid4())
        session_data = await create_openai_session()

        active_sessions[session_id] = {
            "data": session_data,
            "is_active": True,
        }

        logger.info(f"Создана сессия: {session_id}")
        return {"session_id": session_id, **session_data}
    except Exception as e:
        logger.error(f"Ошибка создания сессии: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Internal server error"},
        )


async def validate_session(
    websocket: WebSocket, session_id: str
) -> tuple[bool, SessionData | None]:
    """Проверяет валидность сессии и отправляет сообщение об ошибке если необходимо."""
    if session_id not in active_sessions:
        logger.warning(f"Недействительная сессия: {session_id}")
        await websocket.send_json(
            {"type": "error", "message": "Недействительный ID сессии"}
        )
        try:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        except RuntimeError:
            logger.debug("WebSocket уже закрыт при проверке ID сессии")
        return False, None

    session = active_sessions[session_id]
    if not session["is_active"]:
        logger.warning(f"Неактивная сессия: {session_id}")
        await websocket.send_json({"type": "error", "message": "Сессия неактивна"})
        try:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        except RuntimeError:
            logger.debug("WebSocket уже закрыт при проверке активности сессии")
        return False, None

    return True, session


async def send_session_info(
    websocket: WebSocket, session_id: str, session: SessionData
) -> bool:
    """Отправляет информацию о сессии клиенту."""
    try:
        # Отправляем подтверждение подключения
        await websocket.send_json(
            {"type": "status", "message": "WebSocket соединение установлено"}
        )

        # Также отправляем информацию о сессии
        session_info = {
            "type": "session_info",
            "session_id": session_id,
            "is_active": session["is_active"],
        }
        await websocket.send_json(session_info)
        logger.debug(f"Информация о сессии отправлена: {session_id}")
        return True
    except Exception as e:
        logger.error(f"Ошибка при отправке информации о сессии: {str(e)}")
        return False


async def process_client_message(websocket: WebSocket, data: str) -> None:
    """Обрабатывает сообщение от клиента."""
    try:
        message = json.loads(data)
        message_type = message.get("type", "unknown")

        # Обработка транскрипций
        if message_type == "transcript":
            transcript_text = message.get("text", "")
            if transcript_text:
                # Только если есть текст транскрипции
                logger.debug(
                    f"Транскрипция: {transcript_text[:30]}..."
                    if len(transcript_text) > 30
                    else f"Транскрипция: {transcript_text}"
                )

        # Подтверждение получения
        await websocket.send_json(
            {
                "type": "status",
                "message": f"Получено сообщение типа {message_type}",
            }
        )
    except json.JSONDecodeError:
        logger.warning("Получены не-JSON данные")
        await websocket.send_json(
            {
                "type": "error",
                "message": "Ожидался JSON формат",
            }
        )


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    Обработчик WebSocket соединений.

    Устанавливает двустороннюю связь с клиентом для сессии с указанным ID.
    """
    logger.info(f"WebSocket подключение для сессии: {session_id}")
    connection_closed = False

    try:
        await websocket.accept()
        logger.debug(f"WebSocket соединение принято: {session_id}")

        # Проверяем валидность сессии
        is_valid, session = await validate_session(websocket, session_id)
        if not is_valid:
            connection_closed = True
            return

        # Отправляем информацию о сессии
        success = await send_session_info(websocket, session_id, session)
        if not success:
            # Устанавливаем флаг, что соединение нужно закрыть
            if not connection_closed:
                await websocket.close()
                connection_closed = True
            return

        # Основной цикл обработки сообщений
        try:
            while True:
                try:
                    data = await websocket.receive_text()
                    await process_client_message(websocket, data)
                except WebSocketDisconnect:
                    logger.info(f"Клиент отключился: {session_id}")
                    connection_closed = True
                    break
        except Exception as e:
            logger.error(f"Ошибка в цикле обработки WebSocket: {str(e)}")

    except Exception as e:
        logger.error(f"Ошибка при установке WebSocket соединения: {str(e)}")
    finally:
        # Закрываем WebSocket соединение только если оно еще открыто
        if not connection_closed:
            try:
                await websocket.close()
            except RuntimeError as e:
                logger.debug(f"Не удалось закрыть WebSocket: {str(e)}")
        logger.debug(f"WebSocket соединение закрыто: {session_id}")


@router.delete("/api/session/{session_id}")
async def close_session(session_id: str):
    """Закрывает сессию, помечая её как неактивную."""
    if session_id in active_sessions:
        active_sessions[session_id]["is_active"] = False
        logger.info(f"Сессия закрыта: {session_id}")
        return {"status": "success"}

    logger.warning(f"Попытка закрыть несуществующую сессию: {session_id}")
    raise HTTPException(status_code=404, detail="Session not found")
