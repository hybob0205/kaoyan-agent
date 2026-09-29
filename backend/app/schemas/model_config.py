from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, Field

ProviderName = Literal["openai_compatible", "ollama"]


class ModelConfigUpsertRequest(BaseModel):
    provider: ProviderName
    base_url: AnyHttpUrl
    model: str = Field(min_length=1, max_length=150)
    embedding_model: str = Field(default="", max_length=150)
    temperature: float = Field(default=0.2, ge=0, le=2)
    api_key: str | None = Field(default=None, max_length=1000)
    clear_api_key: bool = False


class ModelConfigResponse(BaseModel):
    provider: ProviderName
    base_url: str
    model: str
    embedding_model: str
    temperature: float
    has_api_key: bool
    api_key_masked: str


class ModelHealthResponse(BaseModel):
    ok: bool
    message: str
    latency_ms: int


class ModelProfileUpsertRequest(ModelConfigUpsertRequest):
    expected_version: int = Field(ge=0)
    id: str | None = Field(default=None, max_length=80)
    name: str = Field(min_length=1, max_length=60)


class ModelProfileVersionRequest(BaseModel):
    expected_version: int = Field(ge=0)


class ModelProfileResponse(ModelConfigResponse):
    id: str
    name: str


class ModelProfilesResponse(BaseModel):
    version: int
    active_id: str
    items: list[ModelProfileResponse]
