from app.routers.auth import router as auth_router
from app.routers.camera_ingest import router as camera_ingest_router
from app.routers.decision_ledger import router as decision_ledger_router
from app.routers.incidents import router as incidents_router
from app.routers.inspection import router as inspection_router
from app.routers.line import router as line_router
from app.routers.live_ops import router as live_ops_router
from app.routers.missions import router as missions_router
from app.routers.openbmc import router as openbmc_router
from app.routers.twin_agent import router as twin_agent_router
from app.routers.web import router as web_router
from app.industrial_data_engine.router import router as industrial_data_engine_router

__all__ = [
    "auth_router",
    "camera_ingest_router",
    "decision_ledger_router",
    "incidents_router",
    "industrial_data_engine_router",
    "inspection_router",
    "line_router",
    "live_ops_router",
    "missions_router",
    "openbmc_router",
    "twin_agent_router",
    "web_router",
]
