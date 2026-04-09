from app.routers.auth import router as auth_router
from app.routers.missions import router as missions_router
from app.routers.web import router as web_router

__all__ = ["auth_router", "missions_router", "web_router"]
