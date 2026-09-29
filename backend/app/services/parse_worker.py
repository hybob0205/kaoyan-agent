"""Subprocess entry point for bounded PDF extraction."""

import json
import shutil
import sys
import tempfile
from pathlib import Path
import subprocess

from app.services.rag import DocumentParseError, TextSection, _extract_pdf_pages, extract_sections


def vision_ocr(filename: str, content: bytes) -> dict:
    if sys.platform != "darwin":
        raise DocumentParseError("扫描版 PDF 和图片 OCR 当前需要 macOS 的 Vision 组件")
    swift = shutil.which("swift")
    if swift is None:
        raise DocumentParseError("未找到 macOS Swift 运行环境，无法启动本机 OCR")
    suffix = Path(filename).suffix.lower()
    kind = "image" if suffix in {".png", ".jpg", ".jpeg"} else "pdf"
    helper = Path(__file__).with_name("apple_vision_ocr.swift")
    with tempfile.TemporaryDirectory(prefix="kaoyan-ocr-") as temp_dir:
        source = Path(temp_dir) / f"source{suffix}"
        source.write_bytes(content)
        try:
            result = subprocess.run(
                [swift, str(helper), str(source), kind],
                capture_output=True,
                timeout=120,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            raise DocumentParseError("OCR 处理超时，请拆分文件或降低图片分辨率后重试") from error
    try:
        payload = json.loads(result.stdout)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise DocumentParseError("本机 OCR 结果无法解析，请检查文件后重试") from error
    if result.returncode:
        raise DocumentParseError(str(payload.get("error") or "本机 OCR 处理失败"))
    return payload


def main() -> int:
    filename = sys.argv[1]
    content = sys.stdin.buffer.read()
    try:
        suffix = Path(filename).suffix.lower()
        if suffix in {".png", ".jpg", ".jpeg"}:
            vision = vision_ocr(filename, content)
            sections = [TextSection(str(item["text"]), int(item["page"])) for item in vision["pages"]]
            formula_images = vision["pages"]
        elif suffix == ".pdf":
            sections = _extract_pdf_pages(content)
            sparse_pages = {section.page for section in sections if len(section.text.strip()) < 30}
            if sparse_pages:
                vision = vision_ocr(filename, content)
                ocr_by_page = {int(item["page"]): item for item in vision["pages"]}
                sections = [
                    TextSection(str(ocr_by_page[section.page]["text"]), section.page)
                    if section.page in sparse_pages and section.page in ocr_by_page
                    else section
                    for section in sections
                ]
                formula_images = [ocr_by_page[page] for page in sorted(sparse_pages) if page in ocr_by_page]
            else:
                formula_images = []
        else:
            sections = extract_sections(filename, content)
            formula_images = []
        sections = [section for section in sections if section.text.strip()]
        if not sections:
            raise DocumentParseError("文件中没有识别到可索引文字")
    except DocumentParseError as error:
        sys.stdout.write(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 2
    sys.stdout.write(json.dumps({
        "sections": [{"text": item.text, "page": item.page} for item in sections],
        "formula_images": formula_images,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
