import sqlite3
import pytest
from pathlib import Path
from types import SimpleNamespace
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import prepare_lan  # noqa: E402


def test_lan_secret_upgrade_preserves_encrypted_model_key(tmp_path, monkeypatch) -> None:
    database = tmp_path / "kaoyan.db"
    old_key = prepare_lan._cipher("old-development-secret")
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE model_configs (id INTEGER PRIMARY KEY, secret_ciphertext TEXT)")
        connection.execute("INSERT INTO model_configs VALUES (?, ?)", (1, old_key.encrypt(b"test-api-key").decode("ascii")))
    monkeypatch.setattr(prepare_lan, "ROOT", tmp_path)
    monkeypatch.setattr(prepare_lan, "Settings", lambda: SimpleNamespace(
        resolved_database_url=f"sqlite:///{database}", model_config_secret="old-development-secret", jwt_secret="old-jwt-secret",
    ))

    generated = prepare_lan.prepare_lan_secrets()

    assert generated["JWT_SECRET"] != generated["MODEL_CONFIG_SECRET"]
    assert prepare_lan.prepare_lan_secrets() == generated
    assert len(list((tmp_path / ".run").glob("kaoyan-before-lan-*.db"))) == 1
    with sqlite3.connect(database) as connection:
        ciphertext = connection.execute("SELECT secret_ciphertext FROM model_configs WHERE id=1").fetchone()[0]
    assert prepare_lan._cipher(generated["MODEL_CONFIG_SECRET"]).decrypt(ciphertext.encode("ascii")) == b"test-api-key"


def test_lan_secret_upgrade_recovers_after_key_file_promotion_failure(tmp_path, monkeypatch) -> None:
    database = tmp_path / "kaoyan.db"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE model_configs (id INTEGER PRIMARY KEY, secret_ciphertext TEXT)")
        connection.execute("INSERT INTO model_configs VALUES (?, ?)", (
            1, prepare_lan._cipher("old-secret").encrypt(b"preserved-key").decode("ascii"),
        ))
    monkeypatch.setattr(prepare_lan, "ROOT", tmp_path)
    monkeypatch.setattr(prepare_lan, "Settings", lambda: SimpleNamespace(
        resolved_database_url=f"sqlite:///{database}", model_config_secret="old-secret", jwt_secret="old-jwt",
    ))
    real_replace = prepare_lan.os.replace

    def interrupted_replace(source, destination):
        raise OSError("simulated interruption")

    monkeypatch.setattr(prepare_lan.os, "replace", interrupted_replace)
    with pytest.raises(OSError, match="simulated interruption"):
        prepare_lan.prepare_lan_secrets()
    assert (tmp_path / ".run" / "lan-secrets.pending").is_file()
    assert not (tmp_path / ".run" / "lan-secrets.env").exists()
    monkeypatch.setattr(prepare_lan.os, "replace", real_replace)

    recovered = prepare_lan.prepare_lan_secrets()
    assert (tmp_path / ".run" / "lan-secrets.env").is_file()
    assert not (tmp_path / ".run" / "lan-secrets.pending").exists()
    with sqlite3.connect(database) as connection:
        ciphertext = connection.execute("SELECT secret_ciphertext FROM model_configs WHERE id=1").fetchone()[0]
    assert prepare_lan._cipher(recovered["MODEL_CONFIG_SECRET"]).decrypt(ciphertext.encode("ascii")) == b"preserved-key"
