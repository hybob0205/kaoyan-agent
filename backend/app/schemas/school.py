from datetime import datetime

from pydantic import BaseModel, Field


class SchoolCandidateInput(BaseModel):
    school: str = Field(min_length=1, max_length=120)
    major: str = Field(min_length=1, max_length=120)
    year: int | None = Field(default=None, ge=2000, le=2100)
    score_line: int | None = Field(default=None, ge=0, le=500)
    source: str = Field(default="", max_length=500)
    note: str = Field(default="", max_length=3000)


class SchoolCandidateResponse(SchoolCandidateInput):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
