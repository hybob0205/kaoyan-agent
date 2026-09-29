import json
from collections import Counter
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser, DatabaseSession
from app.models.plan import Checkin, Plan, Review, Task
from app.schemas.review import ReviewMetrics, WeeklyReviewResponse

router = APIRouter(prefix="/reviews", tags=["reviews"])


def serialize_review(review: Review) -> WeeklyReviewResponse:
    return WeeklyReviewResponse(
        id=review.id,
        period_start=review.period_start,
        period_end=review.period_end,
        metrics=ReviewMetrics.model_validate(json.loads(review.metrics_json)),
        content=review.content,
        updated_at=review.updated_at,
    )


def load_review(db: Session, user_id: int, period_start: date, period_end: date) -> Review | None:
    return db.scalar(select(Review).where(
        Review.user_id == user_id,
        Review.period_start == period_start,
        Review.period_end == period_end,
    ))


def create_review(db: Session, user_id: int, period_start: date, period_end: date, label: str, next_label: str) -> Review:
    tasks = list(db.scalars(
        select(Task).join(Plan).where(
            Plan.user_id == user_id,
            Plan.status == "active",
            Plan.plan_type == "daily",
            Task.due_date.between(period_start, period_end),
        )
    ))
    checkins = list(db.scalars(
        select(Checkin).join(Task).join(Plan).where(
            Plan.user_id == user_id,
            Plan.status == "active",
            Plan.plan_type == "daily",
            Task.due_date.between(period_start, period_end),
        )
    ))
    completed_tasks = sum(task.status == "completed" for task in tasks)
    subject_minutes: Counter[str] = Counter()
    for checkin in checkins:
        subject_minutes[checkin.task.subject] += checkin.actual_minutes
    metrics = ReviewMetrics(
        planned_tasks=len(tasks),
        completed_tasks=completed_tasks,
        completion_rate=round(completed_tasks / len(tasks) * 100) if tasks else 0,
        planned_minutes=sum(task.minutes for task in tasks),
        actual_minutes=sum(checkin.actual_minutes for checkin in checkins),
        subject_minutes=dict(subject_minutes),
        incomplete_reasons=dict(Counter(
            checkin.difficulty for checkin in checkins if not checkin.completed and checkin.difficulty
        )),
    )
    if not tasks:
        content = f"{label}暂无计划数据。先生成并执行今日计划，再用真实记录进行复盘。"
    elif metrics.completion_rate >= 80:
        content = f"{label}任务完成率为 {metrics.completion_rate}%。执行节奏稳定，{next_label}保持当前任务量，并优先巩固薄弱点。"
    elif metrics.completion_rate >= 50:
        content = f"{label}任务完成率为 {metrics.completion_rate}%。建议{next_label}减少同时推进的内容，把未完成任务拆成更小步骤。"
    else:
        content = f"{label}任务完成率为 {metrics.completion_rate}%。{next_label}应先降低任务总量，并根据未完成原因保留必要的顺延任务。"
    review = load_review(db, user_id, period_start, period_end)
    values = {"metrics_json": json.dumps(metrics.model_dump(), ensure_ascii=False), "content": content}
    if review is None:
        review = Review(user_id=user_id, period_start=period_start, period_end=period_end, **values)
        db.add(review)
    else:
        review.metrics_json = values["metrics_json"]
        review.content = content
    db.commit()
    db.refresh(review)
    return review


@router.get("/daily", response_model=WeeklyReviewResponse)
def get_daily_review(user: CurrentUser, db: DatabaseSession) -> WeeklyReviewResponse:
    today = date.today()
    review = load_review(db, user.id, today, today)
    if review is None:
        raise HTTPException(status_code=404, detail="今天还没有日报")
    return serialize_review(review)


@router.post("/daily", response_model=WeeklyReviewResponse)
def create_daily_review(user: CurrentUser, db: DatabaseSession) -> WeeklyReviewResponse:
    today = date.today()
    return serialize_review(create_review(db, user.id, today, today, "今日", "明日"))


@router.get("/weekly", response_model=WeeklyReviewResponse)
def get_weekly_review(user: CurrentUser, db: DatabaseSession) -> WeeklyReviewResponse:
    period_end = date.today()
    period_start = period_end - timedelta(days=6)
    review = load_review(db, user.id, period_start, period_end)
    if review is None:
        raise HTTPException(status_code=404, detail="本周还没有复盘")
    return serialize_review(review)


@router.post("/weekly", response_model=WeeklyReviewResponse)
def create_weekly_review(user: CurrentUser, db: DatabaseSession) -> WeeklyReviewResponse:
    period_end = date.today()
    period_start = period_end - timedelta(days=6)
    return serialize_review(create_review(db, user.id, period_start, period_end, "本周", "下周"))
