from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Subject = Literal["math2", "english2", "politics"]
TaskStatus = Literal["pending", "completed", "skipped"]


class GeneratePlanRequest(BaseModel):
    regenerate: bool = False


class GenerateWeeklyPlanRequest(BaseModel):
    regenerate: bool = False


class AdjustNextDayRequest(BaseModel):
    regenerate: bool = False


class TaskResponse(BaseModel):
    id: int
    subject: Subject
    title: str
    minutes: int
    due_date: date
    status: TaskStatus
    priority: int
    sort_order: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlanResponse(BaseModel):
    id: int
    plan_type: str
    start_date: date
    end_date: date
    status: str
    rationale: str
    version: int
    total_minutes: int
    completed_minutes: int
    tasks: list[TaskResponse]


class TaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    minutes: int | None = Field(default=None, ge=5, le=1440)
    status: TaskStatus | None = None
    priority: int | None = Field(default=None, ge=1, le=3)


class TaskCreateRequest(BaseModel):
    subject: Subject
    title: str = Field(min_length=1, max_length=200)
    minutes: int = Field(ge=5, le=1440)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("任务标题不能为空")
        return title
