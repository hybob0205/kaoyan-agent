from datetime import date, timedelta

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.dependencies import CurrentUser, DatabaseSession
from app.models.plan import Checkin, Plan, Task
from app.schemas.checkin import CheckinRequest, CheckinResponse, CheckinResult
from app.schemas.plan import TaskResponse

router = APIRouter(prefix="/checkins", tags=["checkins"])


def consecutive_days(study_days: set[date], today: date) -> int:
    current = today if today in study_days else today - timedelta(days=1)
    count = 0
    while current in study_days:
        count += 1
        current -= timedelta(days=1)
    return count


@router.get("/streak")
def get_streak(user: CurrentUser, db: DatabaseSession) -> dict[str, int]:
    days = set(db.scalars(
        select(Task.due_date)
        .join(Checkin, Checkin.task_id == Task.id)
        .join(Plan, Plan.id == Task.plan_id)
        .where(Checkin.user_id == user.id, Checkin.completed == 1, Plan.plan_type == "daily")
    ))
    return {"days": consecutive_days(days, date.today())}


@router.post("", response_model=CheckinResult)
def record_checkin(payload: CheckinRequest, user: CurrentUser, db: DatabaseSession) -> CheckinResult:
    task = db.scalar(
        select(Task)
        .join(Plan)
        .where(Task.id == payload.task_id, Plan.user_id == user.id, Plan.status == "active")
    )
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")

    checkin = db.scalar(
        select(Checkin).where(Checkin.user_id == user.id, Checkin.task_id == task.id)
    )
    values = {
        "completed": int(payload.completed),
        "actual_minutes": payload.actual_minutes,
        "difficulty": None if payload.completed else payload.difficulty,
        "note": payload.note.strip(),
    }
    if checkin is None:
        checkin = Checkin(user_id=user.id, task_id=task.id, **values)
        db.add(checkin)
    else:
        for field, value in values.items():
            setattr(checkin, field, value)

    task.status = "completed" if payload.completed else "skipped"
    db.commit()
    db.refresh(checkin)
    db.refresh(task)
    return CheckinResult(
        checkin=CheckinResponse(
            id=checkin.id,
            task_id=checkin.task_id,
            completed=bool(checkin.completed),
            actual_minutes=checkin.actual_minutes,
            difficulty=checkin.difficulty,
            note=checkin.note,
            updated_at=checkin.updated_at,
        ),
        task=TaskResponse.model_validate(task),
    )
