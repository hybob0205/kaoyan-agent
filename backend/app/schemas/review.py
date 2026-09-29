from datetime import date, datetime

from pydantic import BaseModel


class ReviewMetrics(BaseModel):
    planned_tasks: int
    completed_tasks: int
    completion_rate: int
    planned_minutes: int
    actual_minutes: int
    subject_minutes: dict[str, int]
    incomplete_reasons: dict[str, int]


class WeeklyReviewResponse(BaseModel):
    id: int
    period_start: date
    period_end: date
    metrics: ReviewMetrics
    content: str
    updated_at: datetime
