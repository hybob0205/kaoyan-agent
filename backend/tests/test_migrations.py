import sqlite3
import shutil
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app import models  # noqa: F401
from app.core.database import Base
from scripts.adopt_existing_db import adopt


def test_fresh_upgrade_and_legacy_adoption(tmp_path):
    root = Path(__file__).resolve().parents[1]
    fresh = tmp_path / "fresh.db"
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "migrations"))
    config.attributes["database_url"] = f"sqlite:///{fresh}"
    command.upgrade(config, "head")
    with sqlite3.connect(fresh) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == ("0005_app_snapshots",)
    engine = create_engine(f"sqlite:///{fresh}")
    assert set(Base.metadata.tables) <= set(inspect(engine).get_table_names())
    engine.dispose()

    legacy = tmp_path / "legacy.db"
    config.attributes["database_url"] = f"sqlite:///{legacy}"
    command.upgrade(config, "0001_initial")
    with sqlite3.connect(legacy) as connection:
        connection.execute("DROP TABLE alembic_version")
    engine = create_engine(f"sqlite:///{legacy}")
    with engine.begin() as connection:
        connection.exec_driver_sql("INSERT INTO users (username, email, password_hash) VALUES ('test', 'test@example.com', 'hash')")
    engine.dispose()
    backup = adopt(legacy)
    assert backup.is_file()
    with sqlite3.connect(legacy) as connection:
        assert connection.execute("SELECT count(*) FROM users").fetchone() == (1,)
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == ("0001_initial",)
    config.attributes["database_url"] = f"sqlite:///{legacy}"
    command.upgrade(config, "head")
    with sqlite3.connect(legacy) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == ("0005_app_snapshots",)
        assert connection.execute("SELECT count(*) FROM users").fetchone() == (1,)
    with sqlite3.connect(backup) as connection:
        assert connection.execute("SELECT count(*) FROM users").fetchone() == (1,)

    restored = tmp_path / "restored.db"
    shutil.copy2(backup, restored)
    with sqlite3.connect(restored) as connection:
        assert connection.execute("SELECT username FROM users").fetchone() == ("test",)
    restored_backup = adopt(restored)
    assert restored_backup.is_file()
    with sqlite3.connect(restored) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == ("0001_initial",)


def test_adoption_refuses_schema_drift_without_backup(tmp_path):
    legacy = tmp_path / "incomplete.db"
    with sqlite3.connect(legacy) as connection:
        connection.execute("CREATE TABLE users (id INTEGER PRIMARY KEY)")
    with pytest.raises(ValueError, match="不一致"):
        adopt(legacy)
    assert not list(tmp_path.glob("*.backup-*"))


def test_adoption_stamps_existing_current_schema(tmp_path):
    database = tmp_path / "current.db"
    engine = create_engine(f"sqlite:///{database}")
    Base.metadata.create_all(engine)
    engine.dispose()
    backup = adopt(database)
    assert backup.is_file()
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == ("0005_app_snapshots",)


def test_adoption_recognizes_unversioned_second_revision(tmp_path):
    root = Path(__file__).resolve().parents[1]
    database = tmp_path / "second.db"
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "migrations"))
    config.attributes["database_url"] = f"sqlite:///{database}"
    command.upgrade(config, "0002_agent_actions")
    with sqlite3.connect(database) as connection:
        connection.execute("DROP TABLE alembic_version")
    adopt(database)
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == ("0002_agent_actions",)
