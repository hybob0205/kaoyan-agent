from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class KnowledgeDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    mime_type: str
    size_bytes: int
    status: str
    page_count: int
    chunk_count: int
    error_message: str
    created_at: datetime


class RagQueryRequest(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    top_k: int = Field(default=4, ge=1, le=8)


class RagSource(BaseModel):
    document_id: int
    filename: str
    page: int | None
    excerpt: str
    distance: float


class RagQueryResponse(BaseModel):
    answer: str
    sources: list[RagSource]
