"""Back up and stamp an unversioned SQLite database only when it matches a known revision."""

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from alembic import command
from alembic.autogenerate import produce_migrations
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import models  # noqa: F401
from app.core.database import Base


def adopt(database_path: Path) -> Path:
    database_path = database_path.resolve()
    if not database_path.is_file():
        raise ValueError(f"数据库不存在：{database_path}")
    url = f"sqlite:///{database_path}"
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            tables = set(inspect(connection).get_table_names())
            if "alembic_version" in tables:
                raise ValueError("数据库已有迁移版本记录，请使用 alembic current / upgrade head")
            if not tables:
                raise ValueError("数据库为空，请直接使用 alembic upgrade head")
            diffs = produce_migrations(MigrationContext.configure(connection), Base.metadata).upgrade_ops.as_diffs()
            signatures: set[tuple[str, ...]] = set()
            for diff in diffs:
                if diff[0] == "add_table":
                    signatures.add(("add_table", diff[1].name))
                elif diff[0] == "add_index":
                    signatures.add(("add_index", diff[1].name))
                elif diff[0] == "add_column":
                    signatures.add(("add_column", diff[2], diff[3].name))
                else:
                    signatures.add((str(diff[0]),))
            summary_columns = {
                ("add_column", "agent_conversations", "summary"),
                ("add_column", "agent_conversations", "summarized_message_id"),
            }
            task_edit_columns = {
                ("add_column", "agent_actions", "subject"),
                ("add_column", "agent_actions", "original_minutes"),
            }
            action_table = {
                ("add_table", "agent_actions"),
                ("add_index", "ix_agent_actions_user_id"),
            }
            snapshot_table = {
                ("add_table", "app_snapshots"),
                ("add_index", "ix_app_snapshots_user_id"),
            }
            if not signatures:
                revision = "0005_app_snapshots"
            elif signatures == snapshot_table:
                revision = "0004_agent_task_edits"
            elif signatures == task_edit_columns | snapshot_table:
                revision = "0003_conversation_summaries"
            elif signatures == summary_columns | task_edit_columns | snapshot_table:
                revision = "0002_agent_actions"
            elif signatures == summary_columns | action_table | snapshot_table:
                revision = "0001_initial"
            else:
                raise ValueError("现有表结构与已知迁移不一致，已停止；请先人工核对差异")
    finally:
        engine.dispose()

    backup = database_path.with_name(f"{database_path.name}.backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}")
    if backup.exists():
        raise ValueError(f"备份目标已存在：{backup}")
    with sqlite3.connect(database_path) as source, sqlite3.connect(backup) as destination:
        source.backup(destination)

    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "migrations"))
    config.attributes["database_url"] = url
    command.stamp(config, revision)
    return backup


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path, help="Existing SQLite database file")
    args = parser.parse_args()
    try:
        saved = adopt(args.database)
    except ValueError as error:
        parser.exit(1, f"未修改数据库：{error}\n")
    print(f"已登记迁移版本，备份：{saved}")
