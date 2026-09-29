import re
import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

import chromadb
from pypdf import PdfReader

from app.core.config import get_settings
from app.services.model_provider import ModelProvider

UPLOAD_ROOT = get_settings().resolved_data_root / "uploads"
CHROMA_ROOT = get_settings().resolved_data_root / "chroma"
ALLOWED_SUFFIXES = {".pdf", ".txt", ".md", ".png", ".jpg", ".jpeg"}
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_PDF_PAGES = 300
MAX_EXTRACTED_CHARS = 2_000_000
PDF_PARSE_TIMEOUT_SECONDS = 150


class DocumentParseError(ValueError):
    pass


class EmbeddingModelMismatchError(ValueError):
    pass


@dataclass(frozen=True)
class TextSection:
    text: str
    page: int | None


@dataclass(frozen=True)
class TextChunk:
    text: str
    page: int | None
    index: int


@dataclass(frozen=True)
class ParsedDocument:
    sections: list[TextSection]
    formula_images: list[dict[str, Any]]


def _extract_pdf_pages(content: bytes) -> list[TextSection]:
    try:
        reader = PdfReader(BytesIO(content))
        if reader.is_encrypted:
            raise DocumentParseError("暂不支持加密 PDF")
        if len(reader.pages) > MAX_PDF_PAGES:
            raise DocumentParseError(f"PDF 页数不能超过 {MAX_PDF_PAGES} 页")
        sections = []
        extracted_chars = 0
        for index, page in enumerate(reader.pages, 1):
            text = (page.extract_text() or "").strip()
            extracted_chars += len(text)
            if extracted_chars > MAX_EXTRACTED_CHARS:
                raise DocumentParseError("PDF 可提取文字过多，请拆分后上传")
            sections.append(TextSection(text, index))
        return sections
    except DocumentParseError:
        raise
    except Exception as error:
        raise DocumentParseError("PDF 无法解析，请确认文件未损坏") from error


def extract_sections(filename: str, content: bytes) -> list[TextSection]:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise DocumentParseError("仅支持 PDF、TXT 和 Markdown 文档，以及 PNG/JPG 图片")
    if not content:
        raise DocumentParseError("文件内容为空")
    if len(content) > MAX_FILE_BYTES:
        raise DocumentParseError("文件不能超过 20 MB")
    if suffix == ".pdf":
        sections = [section for section in _extract_pdf_pages(content) if section.text]
        if not sections:
            raise DocumentParseError("PDF 中没有可提取文字，请使用 macOS 版以启用扫描件 OCR")
        return sections
    if suffix in {".png", ".jpg", ".jpeg"}:
        raise DocumentParseError("图片 OCR 需要 macOS Vision，请通过资料库上传图片")
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = content.decode("gb18030")
        except UnicodeDecodeError as error:
            raise DocumentParseError("文本文件必须使用 UTF-8 或 GB18030 编码") from error
    text = text.strip()
    if not text:
        raise DocumentParseError("文件中没有可索引的文字")
    return [TextSection(text, None)]


def _parse_file_isolated(filename: str, content: bytes) -> ParsedDocument:
    """Run document parsing in a bounded subprocess."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "app.services.parse_worker", filename],
            input=content,
            capture_output=True,
            timeout=PDF_PARSE_TIMEOUT_SECONDS,
            cwd=Path(__file__).resolve().parents[2],
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise DocumentParseError("OCR 处理超时，请拆分文件或降低图片分辨率后重试") from error
    try:
        payload = json.loads(result.stdout)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise DocumentParseError("PDF 解析失败，请检查文件是否损坏") from error
    if result.returncode != 0:
        raise DocumentParseError(str(payload.get("error") or "PDF 解析失败"))
    sections = [TextSection(str(item["text"]), int(item["page"]) if item["page"] is not None else None) for item in payload["sections"]]
    return ParsedDocument(sections, payload.get("formula_images", []))


def parse_pdf_isolated(filename: str, content: bytes) -> list[TextSection]:
    """Compatibility wrapper used by existing callers and tests."""
    return _parse_file_isolated(filename, content).sections


def parse_document_isolated(filename: str, content: bytes) -> ParsedDocument:
    return _parse_file_isolated(filename, content)


def split_sections(sections: list[TextSection], target_size: int = 800, overlap: int = 120) -> list[TextChunk]:
    chunks: list[TextChunk] = []
    for section in sections:
        text = re.sub(r"[ \t]+", " ", section.text).strip()
        start = 0
        while start < len(text):
            end = min(len(text), start + target_size)
            if end < len(text):
                candidates = [text.rfind(mark, start + target_size // 2, end) for mark in ("\n", "。", "！", "？", ";", "；")]
                boundary = max(candidates)
                if boundary > start:
                    end = boundary + 1
            value = text[start:end].strip()
            if value:
                chunks.append(TextChunk(value, section.page, len(chunks)))
            if end >= len(text):
                break
            start = max(start + 1, end - overlap)
    if not chunks:
        raise DocumentParseError("文件中没有可索引的文字")
    return chunks


def may_contain_formula(text: str) -> bool:
    return bool(re.search(
        r"[=∫∑√∞±×÷^_≤≥∂∇]|[A-Za-z]\s*[(_^=]|\d\s*/\s*\d|"
        r"公式|积分|导数|极限|矩阵|分数|方程",
        text,
    ))


def collection_for_user(user_id: int, embedding_model: str | None = None):
    CHROMA_ROOT.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(CHROMA_ROOT))
    name = f"kaoyan_user_{user_id}"
    try:
        collection = client.get_collection(name)
    except chromadb.errors.NotFoundError:
        return client.create_collection(
            name=name,
            metadata={"hnsw:space": "cosine", "embedding_model": embedding_model or ""},
        )
    saved_model = (collection.metadata or {}).get("embedding_model")
    if embedding_model and saved_model and saved_model != embedding_model:
        if collection.count() > 0:
            raise EmbeddingModelMismatchError(
                f"现有资料使用 Embedding 模型 {saved_model}，当前配置为 {embedding_model}。"
                "请恢复原模型，或清空资料库后再切换。"
            )
        collection.modify(metadata={"embedding_model": embedding_model})
        return collection
    if embedding_model and not saved_model:
        # Chroma 1.5 treats hnsw:space as immutable configuration, even when its
        # existing value is repeated in a metadata-only modification.
        metadata = {key: value for key, value in (collection.metadata or {}).items() if key != "hnsw:space"}
        collection.modify(metadata={**metadata, "embedding_model": embedding_model})
    return collection


async def index_document(
    user_id: int,
    document_id: int,
    filename: str,
    chunks: list[TextChunk],
    provider: ModelProvider,
    embedding_model: str,
) -> None:
    embeddings: list[list[float]] = []
    for start in range(0, len(chunks), 16):
        embeddings.extend(await provider.embed([chunk.text for chunk in chunks[start:start + 16]]))
    if len(embeddings) != len(chunks):
        raise ValueError("Embedding 返回数量与文本分块不一致")
    collection = collection_for_user(user_id, embedding_model)
    collection.upsert(
        ids=[f"document-{document_id}-chunk-{chunk.index}" for chunk in chunks],
        embeddings=embeddings,
        documents=[chunk.text for chunk in chunks],
        metadatas=[
            {
                "document_id": document_id,
                "filename": filename,
                "page": chunk.page or 0,
                "chunk_index": chunk.index,
            }
            for chunk in chunks
        ],
    )


def delete_document_vectors(user_id: int, document_id: int) -> None:
    collection_for_user(user_id).delete(where={"document_id": document_id})


def text_index_path(stored_name: str) -> Path:
    return UPLOAD_ROOT / f"{stored_name}.chunks.json"


def save_text_index(stored_name: str, chunks: list[TextChunk]) -> None:
    path = text_index_path(stored_name)
    path.write_text(json.dumps([{"text": item.text, "page": item.page} for item in chunks], ensure_ascii=False), encoding="utf-8")


def retrieve_text(user_id: int, documents: list[tuple[int, str, str]], question: str, top_k: int) -> list[dict]:
    """Search extracted text without an embedding service; include legacy vector documents."""
    terms = {question[index:index + 2] for index in range(len(question) - 1) if question[index:index + 2].strip()}
    terms.update(word.lower() for word in re.findall(r"[A-Za-z0-9]{2,}", question))
    if not terms:
        return []
    candidates: list[tuple[int, dict]] = []
    legacy_collection = None
    for document_id, filename, stored_name in documents:
        path = text_index_path(stored_name)
        if path.is_file():
            chunks = json.loads(path.read_text(encoding="utf-8"))
        else:
            if legacy_collection is None:
                legacy_collection = collection_for_user(user_id)
            result = legacy_collection.get(where={"document_id": document_id}, include=["documents", "metadatas"])
            chunks = [
                {"text": text, "page": metadata.get("page") or None}
                for text, metadata in zip(result.get("documents") or [], result.get("metadatas") or [], strict=True)
            ]
        for chunk in chunks:
            body = str(chunk["text"])
            lower = body.lower()
            score = sum(1 for term in terms if term.lower() in lower)
            if score:
                candidates.append((score, {"text": body, "metadata": {"document_id": document_id, "filename": filename, "page": chunk.get("page") or 0}, "distance": 0.0}))
    candidates.sort(key=lambda item: item[0], reverse=True)
    return [item for _, item in candidates[:top_k]]


async def retrieve(
    user_id: int,
    question: str,
    top_k: int,
    provider: ModelProvider,
    embedding_model: str,
) -> list[dict]:
    collection = collection_for_user(user_id, embedding_model)
    count = collection.count()
    if count == 0:
        return []
    query_embedding = (await provider.embed([question]))[0]
    result = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, count),
        include=["documents", "metadatas", "distances"],
    )
    documents = (result.get("documents") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]
    return [
        {"text": text, "metadata": metadata, "distance": float(distance)}
        for text, metadata, distance in zip(documents, metadatas, distances, strict=True)
        if text and metadata and float(distance) <= 0.75
    ]
