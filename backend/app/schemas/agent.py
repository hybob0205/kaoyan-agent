from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field


AgentIntent = Literal["plan_query", "profile_query", "review_query", "school_query", "practice_query", "document_query", "study_advice", "general"]


class HubWrongItem(BaseModel):
    id: str = Field(max_length=80)
    answer: str = Field(default="", max_length=160)
    cause: str = Field(default="", max_length=80)
    notes: str = Field(default="", max_length=300)


class HubCustomMistake(BaseModel):
    title: str = Field(max_length=160)
    source: str = Field(default="", max_length=100)
    detail: str = Field(max_length=400)
    review: str = Field(default="", max_length=400)


class HubSubjectProgress(BaseModel):
    practiced: int = Field(ge=0, le=10000)
    wrong: int = Field(ge=0, le=10000)
    due: int = Field(ge=0, le=10000)
    wrong_ids: list[Annotated[str, Field(max_length=80)]] = Field(default_factory=list, max_length=20)
    wrong_items: list[HubWrongItem] = Field(default_factory=list, max_length=10)
    custom_mistakes: list[HubCustomMistake] = Field(default_factory=list, max_length=5)


class MistakeReviewItem(BaseModel):
    subject: str = Field(default="", max_length=30)
    module: str = Field(default="", max_length=60)
    knowledge: str = Field(default="", max_length=100)
    cause: str = Field(default="", max_length=160)
    question: str = Field(default="", max_length=300)
    my_answer: str = Field(default="", max_length=160)
    answer: str = Field(default="", max_length=160)
    explanation: str = Field(default="", max_length=300)
    next_review: str = Field(default="", max_length=20)
    mastery: int = Field(ge=1, le=5)


class MistakeReviewProgress(BaseModel):
    total: int = Field(ge=0, le=100000)
    due: int = Field(ge=0, le=100000)
    weak: int = Field(ge=0, le=100000)
    items: list[MistakeReviewItem] = Field(default_factory=list, max_length=10)


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: int | None = None
    subject: Literal["auto", "math2", "english2", "politics", "cs408"] = "auto"
    answer_mode: Literal["concise", "step_by_step"] = "concise"
    hub_progress: dict[Literal["math2", "english2", "politics", "cs408"], HubSubjectProgress] = Field(default_factory=dict)
    mistake_review: MistakeReviewProgress | None = None


class AgentChatResponse(BaseModel):
    conversation_id: int
    answer: str
    intent: AgentIntent
    used_tools: list[str]


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=80)


class ConversationDeleteMany(BaseModel):
    ids: list[Annotated[int, Field(gt=0)]] = Field(min_length=1, max_length=100)


class AgentConversationSummary(BaseModel):
    id: int
    title: str
    updated_at: datetime
    message_count: int


class AgentConversationMessage(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    content: str
    used_tools: list[str]
    created_at: datetime


class AgentConversationDetail(AgentConversationSummary):
    summary: str
    messages: list[AgentConversationMessage]


class AgentActionRequest(BaseModel):
    message: str = Field(min_length=1, max_length=200)


class AgentActionResponse(BaseModel):
    id: int
    task_id: int
    action: Literal["complete_task", "create_task", "resize_task"]
    status: Literal["pending", "applied", "cancelled", "expired"]
    preview: str
    created_at: datetime
    expires_at: datetime
    confirmed_at: datetime | None

    model_config = {"from_attributes": True}
