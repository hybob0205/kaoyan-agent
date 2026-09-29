import json
from datetime import datetime
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import CurrentUser, DatabaseSession
from app.core.secrets import decrypt_secret, encrypt_secret
from app.models.model_config import ModelConfig
from app.models.app_snapshot import AppSnapshot
from app.schemas.model_config import (ModelConfigResponse, ModelConfigUpsertRequest, ModelHealthResponse,
                                      ModelProfileUpsertRequest, ModelProfileVersionRequest,
                                      ModelProfileResponse, ModelProfilesResponse)
from app.services.model_provider import LOCAL_EMBED_PREFIX, build_provider

router = APIRouter(prefix="/model-config", tags=["model-config"])
PROFILE_APP_ID = "model-profiles"
MAX_PROFILES = 20


def _profile_store(db: DatabaseSession, user_id: int):
    snapshot = db.scalar(select(AppSnapshot).where(AppSnapshot.user_id == user_id, AppSnapshot.app_id == PROFILE_APP_ID))
    if snapshot is not None:
        return snapshot, json.loads(snapshot.data_json)
    config = db.scalar(select(ModelConfig).where(ModelConfig.user_id == user_id))
    if config is None:
        return None, {"active_id": "", "items": []}
    return None, {"active_id": "legacy", "items": [{
        "id": "legacy", "name": config.model, "provider": config.provider,
        "base_url": config.base_url, "model": config.model,
        "embedding_model": config.embedding_model, "temperature": config.temperature,
        "secret_ciphertext": config.secret_ciphertext,
    }]}


def _profiles_response(version: int, state: dict) -> ModelProfilesResponse:
    items = []
    for item in state["items"]:
        secret = decrypt_secret(item.get("secret_ciphertext"))
        items.append(ModelProfileResponse(
            id=item["id"], name=item["name"], provider=item["provider"],
            base_url=item["base_url"], model=item["model"], embedding_model=item["embedding_model"],
            temperature=item["temperature"], has_api_key=bool(secret),
            api_key_masked=f"••••{secret[-4:]}" if secret else "",
        ))
    return ModelProfilesResponse(version=version, active_id=state["active_id"], items=items)


def _save_profiles(db: DatabaseSession, user_id: int, snapshot: AppSnapshot | None,
                   expected_version: int, state: dict) -> ModelProfilesResponse:
    version = snapshot.version if snapshot else 0
    if version != expected_version:
        raise HTTPException(status_code=409, detail="模型配置已在另一页面更新，请刷新后重试")
    encoded = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    if snapshot is None:
        db.add(AppSnapshot(user_id=user_id, app_id=PROFILE_APP_ID, version=1, data_json=encoded))
    else:
        changed = db.execute(update(AppSnapshot).where(AppSnapshot.id == snapshot.id,
            AppSnapshot.version == expected_version).values(version=expected_version + 1,
            data_json=encoded, updated_at=datetime.now()))
        if changed.rowcount != 1:
            db.rollback()
            raise HTTPException(status_code=409, detail="模型配置已在另一页面更新，请刷新后重试")
    config = db.scalar(select(ModelConfig).where(ModelConfig.user_id == user_id))
    active = next((item for item in state["items"] if item["id"] == state["active_id"]), None)
    if active is None:
        if config is not None:
            db.delete(config)
    else:
        if config is None:
            config = ModelConfig(user_id=user_id)
            db.add(config)
        for field in ("provider", "base_url", "model", "embedding_model", "temperature", "secret_ciphertext"):
            setattr(config, field, active[field])
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="模型配置已在另一页面更新，请刷新后重试") from error
    return _profiles_response(expected_version + 1, state)


def _completion_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=120)


@router.post("/chat/completions")
async def compatible_chat_completion(payload: dict, user: CurrentUser, db: DatabaseSession):
    """Let bundled study apps use the signed-in user's Agent model without exposing its key."""
    config = db.scalar(select(ModelConfig).where(ModelConfig.user_id == user.id))
    if config is None:
        raise HTTPException(status_code=409, detail="请先在 Agent 模型设置中保存接口")
    if config.provider != "openai_compatible":
        raise HTTPException(status_code=409, detail="请在 Agent 模型设置中重新保存统一接口配置")
    messages = payload.get("messages")
    if not isinstance(messages, list) or not 1 <= len(messages) <= 30 or any(
        not isinstance(item, dict) or item.get("role") not in {"system", "user", "assistant"}
        or not isinstance(item.get("content"), (str, list)) for item in messages
    ):
        raise HTTPException(status_code=422, detail="对话消息格式不正确")
    if len(json.dumps(messages, ensure_ascii=False)) > 10_000_000:
        raise HTTPException(status_code=413, detail="对话内容过大")
    try:
        api_key = decrypt_secret(config.secret_ciphertext)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    body = {"model": config.model, "messages": messages, "temperature": config.temperature}
    if payload.get("response_format") == {"type": "json_object"}:
        body["response_format"] = {"type": "json_object"}
    streaming = payload.get("stream") is True
    if streaming:
        body["stream"] = True
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    client = _completion_client()
    try:
        request = client.build_request("POST", f"{config.base_url.rstrip('/')}/chat/completions", headers=headers, json=body)
        response = await client.send(request, stream=streaming)
        response.raise_for_status()
    except httpx.HTTPError as error:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"模型接口请求失败：{type(error).__name__}") from error
    if not streaming:
        try:
            result = response.json()
        except ValueError as error:
            raise HTTPException(status_code=502, detail="模型接口返回了无效 JSON") from error
        finally:
            await response.aclose()
            await client.aclose()
        return JSONResponse(result)

    async def chunks():
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(chunks(), media_type="text/event-stream")


def serialize_config(config: ModelConfig) -> ModelConfigResponse:
    has_api_key = bool(config.secret_ciphertext)
    masked = ""
    if has_api_key:
        secret = decrypt_secret(config.secret_ciphertext)
        masked = f"••••{secret[-4:]}" if len(secret) >= 4 else "••••"
    return ModelConfigResponse(
        provider=config.provider,
        base_url=config.base_url,
        model=config.model,
        embedding_model=config.embedding_model,
        temperature=config.temperature,
        has_api_key=has_api_key,
        api_key_masked=masked,
    )


@router.get("/profiles", response_model=ModelProfilesResponse)
def get_model_profiles(user: CurrentUser, db: DatabaseSession) -> ModelProfilesResponse:
    snapshot, state = _profile_store(db, user.id)
    return _profiles_response(snapshot.version if snapshot else 0, state)


@router.post("/profiles", response_model=ModelProfilesResponse)
def upsert_model_profile(payload: ModelProfileUpsertRequest, user: CurrentUser,
                         db: DatabaseSession) -> ModelProfilesResponse:
    snapshot, state = _profile_store(db, user.id)
    items = list(state["items"])
    previous = next((item for item in items if item["id"] == payload.id), None) if payload.id else None
    if payload.id and previous is None:
        raise HTTPException(status_code=404, detail="模型配置不存在，请刷新后重试")
    if not previous and len(items) >= MAX_PROFILES:
        raise HTTPException(status_code=422, detail="最多保存 20 个模型配置")
    embedding_model = payload.embedding_model.strip()
    if embedding_model == LOCAL_EMBED_PREFIX:
        raise HTTPException(status_code=422, detail="请填写本机 Ollama 的 Embedding 模型")
    secret = previous.get("secret_ciphertext") if previous else None
    if payload.clear_api_key:
        secret = None
    elif payload.api_key and payload.api_key.strip():
        secret = encrypt_secret(payload.api_key.strip())
    item = {
        "id": payload.id or uuid4().hex, "name": payload.name.strip(),
        "provider": "openai_compatible", "base_url": str(payload.base_url).rstrip("/"),
        "model": payload.model.strip(), "embedding_model": embedding_model,
        "temperature": payload.temperature, "secret_ciphertext": secret,
    }
    if not item["name"]:
        raise HTTPException(status_code=422, detail="请填写模型配置名称")
    state = {"active_id": item["id"], "items": [item if saved["id"] == item["id"] else saved for saved in items] if previous else [*items, item]}
    return _save_profiles(db, user.id, snapshot, payload.expected_version, state)


@router.put("/profiles/{profile_id}/activate", response_model=ModelProfilesResponse)
def activate_model_profile(profile_id: str, payload: ModelProfileVersionRequest,
                           user: CurrentUser, db: DatabaseSession) -> ModelProfilesResponse:
    snapshot, state = _profile_store(db, user.id)
    if not any(item["id"] == profile_id for item in state["items"]):
        raise HTTPException(status_code=404, detail="模型配置不存在")
    state["active_id"] = profile_id
    return _save_profiles(db, user.id, snapshot, payload.expected_version, state)


@router.delete("/profiles/{profile_id}", response_model=ModelProfilesResponse)
def delete_model_profile(profile_id: str, payload: ModelProfileVersionRequest,
                         user: CurrentUser, db: DatabaseSession) -> ModelProfilesResponse:
    snapshot, state = _profile_store(db, user.id)
    items = [item for item in state["items"] if item["id"] != profile_id]
    if len(items) == len(state["items"]):
        raise HTTPException(status_code=404, detail="模型配置不存在")
    state = {"items": items, "active_id": state["active_id"] if state["active_id"] != profile_id else items[0]["id"] if items else ""}
    return _save_profiles(db, user.id, snapshot, payload.expected_version, state)


@router.get("", response_model=ModelConfigResponse)
def get_model_config(user: CurrentUser, db: DatabaseSession) -> ModelConfigResponse:
    config = db.scalar(select(ModelConfig).where(ModelConfig.user_id == user.id))
    if config is None:
        raise HTTPException(status_code=404, detail="尚未配置模型")
    return serialize_config(config)


@router.put("", response_model=ModelConfigResponse)
def save_model_config(
    payload: ModelConfigUpsertRequest,
    user: CurrentUser,
    db: DatabaseSession,
) -> ModelConfigResponse:
    config = db.scalar(select(ModelConfig).where(ModelConfig.user_id == user.id))
    if config is None:
        config = ModelConfig(user_id=user.id)
        db.add(config)

    config.provider = payload.provider
    config.base_url = str(payload.base_url).rstrip("/")
    config.model = payload.model.strip()
    embedding_model = payload.embedding_model.strip()
    if embedding_model == LOCAL_EMBED_PREFIX:
        raise HTTPException(status_code=422, detail="请填写本机 Ollama 的 Embedding 模型")
    config.embedding_model = embedding_model
    config.temperature = payload.temperature
    if payload.clear_api_key:
        config.secret_ciphertext = None
    elif payload.api_key:
        config.secret_ciphertext = encrypt_secret(payload.api_key.strip())
    snapshot = db.scalar(select(AppSnapshot).where(AppSnapshot.user_id == user.id, AppSnapshot.app_id == PROFILE_APP_ID))
    if snapshot is not None:
        state = json.loads(snapshot.data_json)
        for item in state["items"]:
            if item["id"] == state["active_id"]:
                for field in ("provider", "base_url", "model", "embedding_model", "temperature", "secret_ciphertext"):
                    item[field] = getattr(config, field)
                break
        snapshot.data_json = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        snapshot.version += 1
    db.commit()
    db.refresh(config)
    return serialize_config(config)


@router.post("/test", response_model=ModelHealthResponse)
async def test_model_config(user: CurrentUser, db: DatabaseSession) -> ModelHealthResponse:
    config = db.scalar(select(ModelConfig).where(ModelConfig.user_id == user.id))
    if config is None:
        raise HTTPException(status_code=404, detail="请先保存模型配置")
    try:
        api_key = decrypt_secret(config.secret_ciphertext)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    provider = build_provider(
        config.provider,
        config.base_url,
        config.model,
        config.embedding_model,
        api_key,
    )
    try:
        result = await provider.health_check()
        if config.embedding_model:
            try:
                embeddings = await provider.embed(["考研资料检索测试"])
                if not embeddings or not embeddings[0]:
                    raise ValueError("Embedding 没有返回向量")
                return ModelHealthResponse(
                    ok=result.ok,
                    message=f"{result.message}；Embedding 可用，可上传资料",
                    latency_ms=result.latency_ms,
                )
            except (httpx.HTTPError, KeyError, ValueError, IndexError):
                return ModelHealthResponse(
                    ok=False,
                    message=f"{result.message}；Embedding 不可用。可以在资料读取方式中选择“对话模型直接阅读”。",
                    latency_ms=result.latency_ms,
                )
    finally:
        await provider.close()
    return ModelHealthResponse(ok=result.ok, message=f"{result.message}；直接阅读资料无需 Embedding", latency_ms=result.latency_ms)
