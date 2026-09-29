"""Explicit per-user backup/restore for the two browser-only study apps."""

import json
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import CurrentUser, DatabaseSession
from app.models.app_snapshot import AppSnapshot

router = APIRouter(prefix="/app-data", tags=["app-data"])
AppId = Literal["study-hub", "mistake-review", "agent-schedule"]
MAX_BYTES = 10_000_000


class SnapshotUpload(BaseModel):
    expected_version: int = Field(ge=0)
    data: dict[str, str] = Field(max_length=100)


class SnapshotResponse(BaseModel):
    app_id: AppId
    version: int
    updated_at: datetime
    data: dict[str, str]


def _snapshot_data(snapshot: AppSnapshot) -> SnapshotResponse:
    return SnapshotResponse(app_id=snapshot.app_id, version=snapshot.version, updated_at=snapshot.updated_at, data=json.loads(snapshot.data_json))


def _validate_keys(app_id: AppId, user_id: int, data: dict[str, str]) -> None:
    if app_id == "agent-schedule":
        if set(data) - {"events"}:
            raise HTTPException(status_code=422, detail="日程包含未知字段")
        if "events" in data:
            try:
                events = json.loads(data["events"])
                if not isinstance(events, list) or len(events) > 30:
                    raise ValueError("invalid events")
                ids = set()
                for item in events:
                    if not isinstance(item, dict) or set(item) != {"id", "title", "date"}:
                        raise ValueError("invalid event")
                    identifier, title, event_date = item["id"], item["title"], item["date"]
                    if (not isinstance(identifier, str) or not 0 < len(identifier) <= 80 or identifier in ids
                        or not isinstance(title, str) or not 0 < len(title.strip()) <= 80
                        or not isinstance(event_date, str) or date.fromisoformat(event_date).isoformat() != event_date):
                        raise ValueError("invalid event")
                    ids.add(identifier)
            except (TypeError, ValueError, KeyError):
                raise HTTPException(status_code=422, detail="日程格式不正确") from None
        return
    if app_id == "study-hub":
        allowed = {f"{subject}-study-v1-agent-{user_id}" for subject in ("math2", "english2", "politics", "cs408")}
        valid = all(key in allowed for key in data)
    else:
        prefix = f"shicuo-agent-{user_id}:"
        fixed = {prefix + name for name in (
            "shicuo-mistakes-v1", "shicuo-chats-v1", "shicuo-export-history-v1", "shicuo-ai-review-plan-v1",
        )}
        valid = all(key in fixed or (key.startswith(prefix + "shicuo-review-count:") and len(key) <= 180) for key in data)
    if not valid:
        raise HTTPException(status_code=422, detail="备份包含不属于当前账号或不允许同步的存储键")


@router.get("/{app_id}", response_model=SnapshotResponse)
def get_snapshot(app_id: AppId, user: CurrentUser, db: DatabaseSession) -> SnapshotResponse:
    snapshot = db.scalar(select(AppSnapshot).where(AppSnapshot.user_id == user.id, AppSnapshot.app_id == app_id))
    if snapshot is None:
        raise HTTPException(status_code=404, detail="当前账号尚无云端备份")
    return _snapshot_data(snapshot)


@router.put("/{app_id}", response_model=SnapshotResponse)
def save_snapshot(app_id: AppId, payload: SnapshotUpload, user: CurrentUser, db: DatabaseSession) -> SnapshotResponse:
    _validate_keys(app_id, user.id, payload.data)
    encoded = json.dumps(payload.data, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="备份超过 10 MB，请先在应用内导出并压缩图片")
    snapshot = db.scalar(select(AppSnapshot).where(AppSnapshot.user_id == user.id, AppSnapshot.app_id == app_id))
    if snapshot is None:
        if payload.expected_version != 0:
            raise HTTPException(status_code=409, detail="云端备份已变化，请刷新后重试")
        snapshot = AppSnapshot(user_id=user.id, app_id=app_id, version=1, data_json=encoded)
        db.add(snapshot)
        try:
            db.commit()
        except IntegrityError as error:
            db.rollback()
            raise HTTPException(status_code=409, detail="云端备份已变化，请刷新后重试") from error
    else:
        changed = db.execute(
            update(AppSnapshot)
            .where(AppSnapshot.id == snapshot.id, AppSnapshot.version == payload.expected_version)
            .values(version=AppSnapshot.version + 1, data_json=encoded, updated_at=datetime.now())
        )
        if changed.rowcount != 1:
            db.rollback()
            raise HTTPException(status_code=409, detail="云端备份已变化，请刷新后重试")
        db.commit()
    db.refresh(snapshot)
    return _snapshot_data(snapshot)
