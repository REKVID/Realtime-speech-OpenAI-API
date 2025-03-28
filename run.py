from server.app.main import app
import uvicorn
from server.app.config import Config

if __name__ == "__main__":
    uvicorn.run(app, host=Config.HOST, port=Config.PORT, reload=True)
