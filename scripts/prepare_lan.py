"""Create durable LAN secrets while preserving encrypted model API keys."""

import base64
import hashlib
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
from datetime import datetime

from cryptography.fernet import Fernet
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.core.config import Settings  # noqa: E402


def _cipher(secret: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def _read_secrets(path: Path) -> dict[str, str]:
    values = dict(line.split("=", 1) for line in path.read_text(encoding="utf-8").splitlines() if "=" in line)
    if any(len(values.get(name, "")) < 32 for name in ("JWT_SECRET", "MODEL_CONFIG_SECRET")):
        raise RuntimeError("局域网密钥文件不完整，请检查后再启动")
    return values


def prepare_lan_secrets() -> dict[str, str]:
    run_dir = ROOT / ".run"
    run_dir.mkdir(mode=0o700, exist_ok=True)
    final = run_dir / "lan-secrets.env"
    pending = run_dir / "lan-secrets.pending"
    if final.exists():
        return _read_secrets(final)

    settings = Settings()
    url = make_url(settings.resolved_database_url)
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        raise RuntimeError("局域网版本目前仅支持本机 SQLite 数据库")
    database = Path(url.database).resolve()
    if not database.is_file():
        raise RuntimeError("未找到本机数据库；请先完成后端初始化")

    old_cipher = _cipher(settings.model_config_secret or settings.jwt_secret)
    with sqlite3.connect(database) as connection:
        rows = connection.execute("SELECT id, secret_ciphertext FROM model_configs WHERE secret_ciphertext IS NOT NULL").fetchall()
        if pending.exists():
            values = _read_secrets(pending)
            new_cipher = _cipher(values["MODEL_CONFIG_SECRET"])
            if all(_decrypts(new_cipher, value) for _, value in rows):
                os.replace(pending, final)
                return values
            if not all(_decrypts(old_cipher, value) for _, value in rows):
                raise RuntimeError("模型密钥状态不一致；请保留数据库和待完成密钥文件并检查备份")
            pending.unlink()
        plaintext = [(item_id, old_cipher.decrypt(value.encode("ascii"))) for item_id, value in rows]
        backup_fd, backup_name = tempfile.mkstemp(
            prefix=f"kaoyan-before-lan-{datetime.now().strftime('%Y%m%d-%H%M%S')}-",
            suffix=".db", dir=run_dir,
        )
        os.close(backup_fd)
        backup = Path(backup_name)
        with sqlite3.connect(backup) as copy:
            connection.backup(copy)
        backup.chmod(0o600)
        values = {"JWT_SECRET": secrets.token_urlsafe(48), "MODEL_CONFIG_SECRET": secrets.token_urlsafe(48)}
        new_cipher = _cipher(values["MODEL_CONFIG_SECRET"])
        fd = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            for key, value in values.items():
                stream.write(f"{key}={value}\n")
            stream.flush()
            os.fsync(stream.fileno())
        try:
            connection.execute("BEGIN IMMEDIATE")
            for item_id, secret in plaintext:
                connection.execute("UPDATE model_configs SET secret_ciphertext=? WHERE id=?", (new_cipher.encrypt(secret).decode("ascii"), item_id))
            connection.commit()
            os.replace(pending, final)
        except Exception:
            connection.rollback()
            raise
    return values


def _decrypts(cipher: Fernet, value: str) -> bool:
    try:
        cipher.decrypt(value.encode("ascii"))
        return True
    except Exception:
        return False


if __name__ == "__main__":
    prepare_lan_secrets()
    print("局域网密钥已准备，原数据库已有备份；现有登录会话需要重新登录。")
