from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.plan import TaskResponse

Difficulty = Literal["too_hard", "time_short", "low_energy", "other"]


class CheckinRequest(BaseModel):
    task_id: int
    completed: bool
    actual_minutes: int = Field(ge=0, le=1440)
    difficulty: Difficulty | None = None
    note: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def validate_reason(self) -> "CheckinRequest":
        if not self.completed and self.difficulty is None:
            raise ValueError("未完成任务需要选择原因")
        return self


class CheckinResponse(BaseModel):
    id: int
    task_id: int
    completed: bool
    actual_minutes: int
    difficulty: Difficulty | None
    note: str
    updated_at: datetime


class CheckinResult(BaseModel):
    checkin: CheckinResponse
    task: TaskResponse
