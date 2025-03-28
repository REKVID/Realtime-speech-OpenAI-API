import uvicorn
from pathlib import Path

if __name__ == "__main__":
    cert_dir = Path(__file__).parent / "certs"
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=3000,
        reload=True,
        ssl_keyfile=str(cert_dir / "key.pem"),
        ssl_certfile=str(cert_dir / "cert.pem")
    ) 