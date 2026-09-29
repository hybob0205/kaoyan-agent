from contextlib import asynccontextmanager
import logging
from time import perf_counter

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app import models  # noqa: F401
from app.api.auth import router as auth_router
from app.api.app_data import router as app_data_router
from app.api.agent import router as agent_router
from app.api.checkins import router as checkins_router
from app.api.health import router as health_router
from app.api.knowledge import router as knowledge_router
from app.api.model_config import router as model_config_router
from app.api.plans import router as plans_router
from app.api.profile import router as profile_router
from app.api.reviews import router as reviews_router
from app.api.quizzes import router as quizzes_router
from app.api.schools import router as schools_router
from app.api.stage_plans import router as stage_plans_router
from app.core.config import PROJECT_ROOT, get_settings
from app.core.database import Base, engine
from app.core.rate_limit import RateLimiter

AUTH_PATHS = {"/api/auth/login", "/api/auth/register"}
MODEL_PATHS = {"/api/agent/chat", "/api/agent/chat/stream", "/api/model-config/chat/completions", "/api/rag/query", "/api/quizzes", "/api/documents"}
limiter = RateLimiter()
request_logger = logging.getLogger("kaoyan.http")
request_logger.setLevel(logging.INFO)
if not request_logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    request_logger.addHandler(handler)
request_logger.propagate = False


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings().validate_for_startup()
    limiter.clear()
    Base.metadata.create_all(bind=engine)
    yield

settings = get_settings()
app = FastAPI(title="Kaoyan Agent API", version="0.2.0", description="Backend for the Kaoyan study-planning agent.", lifespan=lifespan)


@app.middleware("http")
async def limit_requests(request: Request, call_next):
    started = perf_counter()
    if request.method == "POST" and request.url.path in AUTH_PATHS | MODEL_PATHS:
        group, limit = ("auth", 20) if request.url.path in AUTH_PATHS else ("model", 30)
        retry_after = limiter.check(request.client.host if request.client else "unknown", group, limit)
        if retry_after:
            response = JSONResponse(status_code=429, content={"detail": "请求过于频繁，请稍后重试"}, headers={"Retry-After": str(retry_after)})
            request_logger.info("method=%s path=%s status=%s duration_ms=%s", request.method, request.url.path, response.status_code, round((perf_counter() - started) * 1000))
            return response
    try:
        response = await call_next(request)
    except Exception:
        request_logger.error("method=%s path=%s status=500 duration_ms=%s", request.method, request.url.path, round((perf_counter() - started) * 1000))
        raise
    request_logger.info("method=%s path=%s status=%s duration_ms=%s", request.method, request.url.path, response.status_code, round((perf_counter() - started) * 1000))
    return response


app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(app_data_router, prefix="/api")
app.include_router(profile_router, prefix="/api")
app.include_router(plans_router, prefix="/api")
app.include_router(stage_plans_router, prefix="/api")
app.include_router(checkins_router, prefix="/api")
app.include_router(reviews_router, prefix="/api")
app.include_router(quizzes_router, prefix="/api")
app.include_router(model_config_router, prefix="/api")
app.include_router(agent_router, prefix="/api")
app.include_router(knowledge_router, prefix="/api")
app.include_router(schools_router, prefix="/api")

if settings.serve_frontend:
    frontend_dist = PROJECT_ROOT / "frontend" / "dist"
    if not (frontend_dist / "index.html").is_file():
        raise RuntimeError("未找到前端构建文件，请先运行 frontend 的 build 命令")
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
