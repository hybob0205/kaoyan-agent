from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["system"])


@router.get("/health")
def health_check() -> dict[str, str | bool]:
    """Liveness endpoint used by the frontend and deployment checks."""
    return {"status": "ok", "service": "kaoyan-agent-api", "lan_mode": get_settings().app_env.lower() == "lan"}
