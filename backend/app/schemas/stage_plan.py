from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class GenerateStagePlanRequest(BaseModel):
    regenerate: bool = False


class StagePhaseResponse(BaseModel):
    id: int
    sort_order: int
    title: str
    start_date: date
    end_date: date
    math_focus: str
    english_focus: str
    politics_focus: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class StagePlanResponse(BaseModel):
    id: int
    start_date: date
    end_date: date
    exam_date: date
    status: str
    version: int
    rationale: str
    phases: list[StagePhaseResponse]

    model_config = {"from_attributes": True}


class StagePhaseUpdate(BaseModel):
    math_focus: str | None = Field(default=None, min_length=1, max_length=500)
    english_focus: str | None = Field(default=None, min_length=1, max_length=500)
    politics_focus: str | None = Field(default=None, min_length=1, max_length=500)

    model_config = ConfigDict(str_strip_whitespace=True)

    @model_validator(mode="after")
    def require_focus(self) -> "StagePhaseUpdate":
        if not any((self.math_focus, self.english_focus, self.politics_focus)):
            raise ValueError("请至少修改一科复习重点")
        return self
