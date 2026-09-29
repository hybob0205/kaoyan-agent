import sqlite3

import pytest

from scripts.copy_data_dir import copy_data_dir


def test_offline_backup_and_restore_preserve_database_uploads_and_index(tmp_path):
    source = tmp_path / "data"
    source.mkdir()
    with sqlite3.connect(source / "kaoyan.db") as connection:
        connection.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL)")
        connection.execute("INSERT INTO users (username) VALUES ('student')")
    (source / "uploads" / "1").mkdir(parents=True)
    (source / "uploads" / "1" / "note.md").write_text("积分笔记", encoding="utf-8")
    (source / "chroma").mkdir()
    (source / "chroma" / "index.bin").write_bytes(b"index-fixture")

    backup = copy_data_dir(source, tmp_path / "backup")
    restored = copy_data_dir(backup, tmp_path / "restored")
    with sqlite3.connect(restored / "kaoyan.db") as connection:
        assert connection.execute("SELECT username FROM users").fetchone() == ("student",)
    assert (restored / "uploads" / "1" / "note.md").read_text(encoding="utf-8") == "积分笔记"
    assert (restored / "chroma" / "index.bin").read_bytes() == b"index-fixture"


def test_backup_never_overwrites_or_copies_into_itself(tmp_path):
    source = tmp_path / "data"
    source.mkdir()
    with sqlite3.connect(source / "kaoyan.db"):
        pass
    (tmp_path / "existing").mkdir()
    with pytest.raises(ValueError, match="不会覆盖"):
        copy_data_dir(source, tmp_path / "existing")
    with pytest.raises(ValueError, match="源目录之内"):
        copy_data_dir(source, source / "nested")
    with pytest.raises(ValueError, match="数据库名称"):
        copy_data_dir(source, tmp_path / "bad", "../outside.db")
