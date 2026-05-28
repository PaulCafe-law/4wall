from app.routers.auth import router as auth_router
from app.routers.incidents import router as incidents_router
from app.routers.inspection import router as inspection_router
from app.routers.line import router as line_router
from app.routers.live_ops import router as live_ops_router
from app.routers.missions import router as missions_router
from app.routers.web import router as web_router

__all__ = [
    "auth_router",
    "incidents_router",
    "inspection_router",
    "line_router",
    "live_ops_router",
    "missions_router",
    "web_router",
]
