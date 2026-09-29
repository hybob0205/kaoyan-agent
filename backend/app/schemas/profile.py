from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Subject = Literal["math2", "english2", "politics"]


class SubjectLevelInput(BaseModel):
    subject: Subject
    score: int = Field(ge=1, le=5)
    weaknesses: str = Field(default="", max_length=500)


class SubjectLevelResponse(SubjectLevelInput):
    id: int

    model_config = {"from_attributes": True}


class ProfileUpsertRequest(BaseModel):
    exam_date: date
    school: str = Field(min_length=1, max_length=120)
    major: str = Field(min_length=1, max_length=120)
    daily_minutes: int = Field(ge=30, le=1440)
    rest_days: list[int] = Field(default_factory=list)
    subjects: list[SubjectLevelInput] = Field(min_length=3, max_length=3)

    @model_validator(mode="after")
    def validate_profile(self) -> "ProfileUpsertRequest":
        if self.exam_date <= date.today():
            raise ValueError("考试日期必须晚于今天")
        if any(day < 0 or day > 6 for day in self.rest_days):
            raise ValueError("休息日必须是 0 到 6")
        if len(set(self.rest_days)) != len(self.rest_days):
            raise ValueError("休息日不能重复")
        subjects = {item.subject for item in self.subjects}
        if subjects != {"math2", "english2", "politics"}:
            raise ValueError("必须提交数学二、英语二和政治三科基础")
        return self


class ProfileResponse(BaseModel):
    exam_date: date
    school: str
    major: str
    daily_minutes: int
    rest_days: list[int]
    subjects: list[SubjectLevelResponse]
