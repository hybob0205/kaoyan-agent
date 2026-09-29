from pathlib import Path
import subprocess

import pytest

from fastapi.testclient import TestClient

from app.services.model_provider import HealthResult, ModelProvider
from app.services.rag import DocumentParseError, ParsedDocument, TextSection, collection_for_user, extract_sections, may_contain_formula, parse_pdf_isolated, retrieve_text, split_sections


class FakeProvider(ModelProvider):
    def __init__(self) -> None:
        self.closed = False
        self.messages: list[list[dict[str, str]]] = []
        self.images: list[str] = []

    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        self.messages.append(messages)
        return "定积分体现了有向面积的累积。[1]"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[float(len(text)), 1.0] for text in texts]

    async def chat_with_image(self, prompt: str, image_base64: str, temperature: float = 0.1) -> str:
        self.images.append(image_base64)
        return r"f(x) = \int_0^1 x^2\,dx = \frac{1}{3}"

    async def health_check(self) -> HealthResult:
        return HealthResult(True, "ok", 1)

    async def close(self) -> None:
        self.closed = True


def create_configured_user(client: TestClient, name: str) -> dict[str, str]:
    registered = client.post(
        "/api/auth/register",
        json={"username": name, "email": f"{name}@example.com", "password": "password123"},
    )
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    configured = client.put(
        "/api/model-config",
        headers=headers,
        json={
            "provider": "ollama",
            "base_url": "http://127.0.0.1:11434",
            "model": "gemma3:4b",
            "embedding_model": "nomic-embed-text",
            "temperature": 0.2,
        },
    )
    assert configured.status_code == 200
    return headers


def test_text_extraction_chunking_and_rejections() -> None:
    sections = extract_sections("数学笔记.md", ("定积分用于计算有向面积。" * 100).encode())
    chunks = split_sections(sections, target_size=120, overlap=20)
    assert len(chunks) > 1
    assert chunks[0].page is None
    assert "定积分" in chunks[0].text

    with pytest.raises(DocumentParseError, match="图片 OCR 需要 macOS Vision"):
        extract_sections("photo.png", b"not an image")

    assert may_contain_formula("请写出图中的积分公式")
    assert not may_contain_formula("中国特色社会主义制度是根本保障")


def test_pdf_parse_isolated_rejects_invalid_file_and_timeout(monkeypatch) -> None:
    with pytest.raises(DocumentParseError, match="无法解析"):
        parse_pdf_isolated("broken.pdf", b"not a pdf")

    def timed_out(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args[0], timeout=20)

    monkeypatch.setattr("app.services.rag.subprocess.run", timed_out)
    with pytest.raises(DocumentParseError, match="超时"):
        parse_pdf_isolated("slow.pdf", b"%PDF-1.7")


def test_upload_is_user_scoped(client: TestClient, monkeypatch, tmp_path: Path) -> None:
    headers_a = create_configured_user(client, "knowledge-a")
    headers_b = create_configured_user(client, "knowledge-b")
    fake = FakeProvider()
    indexed: list[tuple[int, int, str, int]] = []

    async def fake_index(user_id, document_id, filename, chunks, provider, embedding_model) -> None:
        indexed.append((user_id, document_id, filename, len(chunks)))

    monkeypatch.setattr("app.api.knowledge.UPLOAD_ROOT", tmp_path)
    monkeypatch.setattr("app.services.rag.CHROMA_ROOT", tmp_path / "chroma")
    monkeypatch.setattr("app.api.knowledge.build_provider", lambda *args: fake)
    monkeypatch.setattr("app.api.knowledge.index_document", fake_index)

    uploaded = client.post(
        "/api/documents",
        headers=headers_a,
        files={"file": ("积分笔记.md", "定积分用于计算有向面积。".encode(), "text/markdown")},
    )

    assert uploaded.status_code == 201, uploaded.text
    assert uploaded.json()["status"] == "ready"
    assert uploaded.json()["chunk_count"] == 1
    assert indexed[0][2] == "积分笔记.md"
    assert client.get("/api/documents", headers=headers_b).json() == []
    assert fake.closed is True


def test_formula_ocr_is_added_to_indexed_text(client: TestClient, monkeypatch, tmp_path: Path) -> None:
    headers = create_configured_user(client, "knowledge-formula")
    fake = FakeProvider()
    indexed_text: list[str] = []

    async def fake_index(user_id, document_id, filename, chunks, provider, embedding_model) -> None:
        indexed_text.extend(chunk.text for chunk in chunks)

    monkeypatch.setattr("app.api.knowledge.UPLOAD_ROOT", tmp_path)
    monkeypatch.setattr("app.services.rag.CHROMA_ROOT", tmp_path / "chroma")
    monkeypatch.setattr("app.api.knowledge.build_provider", lambda *args: fake)
    monkeypatch.setattr("app.api.knowledge.parse_document_isolated", lambda *args: ParsedDocument(
        [TextSection("f(x) = ∫₀¹ x² dx = 1/3", 1)],
        [{"page": 1, "text": "f(x) = ∫₀¹ x² dx = 1/3", "image_base64": "sample-image"}],
    ))
    monkeypatch.setattr("app.api.knowledge.index_document", fake_index)

    response = client.post(
        "/api/documents",
        headers=headers,
        files={"file": ("formula.png", b"sample-image", "image/png")},
    )

    assert response.status_code == 201, response.text
    assert response.json()["page_count"] == 1
    assert fake.images == ["sample-image"]
    assert any(r"\frac{1}{3}" in text for text in indexed_text)


def test_existing_chroma_collection_can_record_embedding_model(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("app.services.rag.CHROMA_ROOT", tmp_path / "chroma")
    collection_for_user(17)

    collection = collection_for_user(17, "nomic-embed-text")
    assert collection.metadata["embedding_model"] == "nomic-embed-text"
    assert collection.configuration["hnsw"]["space"] == "cosine"


def test_empty_collection_can_switch_embedding_model_after_failed_upload(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("app.services.rag.CHROMA_ROOT", tmp_path / "chroma")
    collection_for_user(18, "text-embedding-3-small")
    switched = collection_for_user(18, "ollama://nomic-embed-text")
    assert switched.count() == 0
    assert switched.metadata["embedding_model"] == "ollama://nomic-embed-text"


def test_direct_reading_can_search_existing_vector_documents(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("app.services.rag.UPLOAD_ROOT", tmp_path / "uploads")
    monkeypatch.setattr("app.services.rag.CHROMA_ROOT", tmp_path / "chroma")
    collection = collection_for_user(23, "ollama://nomic-embed-text")
    collection.upsert(ids=["document-7-chunk-0"], embeddings=[[0.1, 0.2]], documents=["定积分可表示有向面积"], metadatas=[{
        "document_id": 7, "filename": "旧讲义.pdf", "page": 3, "chunk_index": 0,
    }])
    matches = retrieve_text(23, [(7, "旧讲义.pdf", "23/old.pdf")], "定积分表示什么", 4)
    assert matches[0]["metadata"]["page"] == 3
    assert "有向面积" in matches[0]["text"]


def test_rag_answer_returns_traceable_sources(client: TestClient, monkeypatch) -> None:
    headers = create_configured_user(client, "knowledge-query")
    fake = FakeProvider()

    async def fake_retrieve(*args, **kwargs) -> list[dict]:
        return [{
            "text": "定积分可以表示函数图像与横轴之间的有向面积。",
            "metadata": {"document_id": 7, "filename": "高数讲义.pdf", "page": 12},
            "distance": 0.12,
        }]

    monkeypatch.setattr("app.api.knowledge.build_provider", lambda *args: fake)
    monkeypatch.setattr("app.api.knowledge.retrieve", fake_retrieve)

    response = client.post("/api/rag/query", headers=headers, json={"question": "定积分是什么？"})

    assert response.status_code == 200, response.text
    assert response.json()["sources"][0]["filename"] == "高数讲义.pdf"
    assert response.json()["sources"][0]["page"] == 12
    assert "[1]" in response.json()["answer"]
    assert "不可信数据" in fake.messages[0][0]["content"]
    assert fake.closed is True


def test_custom_chat_reads_uploaded_document_without_embeddings(client: TestClient, monkeypatch, tmp_path: Path) -> None:
    registered = client.post("/api/auth/register", json={"username": "direct-reader", "email": "direct@example.com", "password": "password123"})
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    saved = client.put("/api/model-config", headers=headers, json={
        "provider": "openai_compatible", "base_url": "https://chat.example.com/v1",
        "model": "chat-model", "embedding_model": "", "temperature": 0.2,
    })
    assert saved.status_code == 200, saved.text
    fake = FakeProvider()

    async def no_embeddings(_):
        raise AssertionError("直接阅读不应请求 Embedding 接口")

    fake.embed = no_embeddings
    monkeypatch.setattr("app.api.knowledge.UPLOAD_ROOT", tmp_path)
    monkeypatch.setattr("app.services.rag.UPLOAD_ROOT", tmp_path)
    monkeypatch.setattr("app.services.rag.CHROMA_ROOT", tmp_path / "chroma")
    monkeypatch.setattr("app.api.knowledge.build_provider", lambda *args: fake)

    uploaded = client.post("/api/documents", headers=headers, files={"file": ("积分.md", "定积分表示有向面积。".encode(), "text/markdown")})
    assert uploaded.status_code == 201, uploaded.text
    assert len(list(tmp_path.rglob("*.chunks.json"))) == 1

    response = client.post("/api/rag/query", headers=headers, json={"question": "定积分表示什么？"})
    assert response.status_code == 200, response.text
    assert response.json()["sources"][0]["filename"] == "积分.md"
    assert "定积分表示有向面积" in fake.messages[0][1]["content"]

    deleted = client.delete(f"/api/documents/{uploaded.json()['id']}", headers=headers)
    assert deleted.status_code == 204
    assert list(tmp_path.rglob("*.chunks.json")) == []


def test_custom_chat_accepts_pdf_without_embedding_endpoint(client: TestClient, monkeypatch, tmp_path: Path) -> None:
    registered = client.post("/api/auth/register", json={"username": "direct-pdf", "email": "direct-pdf@example.com", "password": "password123"})
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    client.put("/api/model-config", headers=headers, json={
        "provider": "openai_compatible", "base_url": "https://chat.example.com/v1",
        "model": "chat-model", "embedding_model": "", "temperature": 0.2,
    })
    fake = FakeProvider()

    async def no_embeddings(_):
        raise AssertionError("PDF 上传不应请求 Embedding 接口")

    fake.embed = no_embeddings
    monkeypatch.setattr("app.api.knowledge.UPLOAD_ROOT", tmp_path)
    monkeypatch.setattr("app.services.rag.UPLOAD_ROOT", tmp_path)
    monkeypatch.setattr("app.api.knowledge.build_provider", lambda *args: fake)
    monkeypatch.setattr("app.api.knowledge.parse_document_isolated", lambda *args: ParsedDocument([TextSection("高等数学积分知识", 1)], []))

    response = client.post("/api/documents", headers=headers, files={"file": ("高数.pdf", b"%PDF-example", "application/pdf")})
    assert response.status_code == 201, response.text
    assert response.json()["page_count"] == 1
    assert len(list(tmp_path.rglob("*.chunks.json"))) == 1
