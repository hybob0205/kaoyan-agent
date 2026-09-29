"""Copy an offline data directory to a new location for backup or restore."""

import argparse
import shutil
import sqlite3
from pathlib import Path


def _check_database(path: Path) -> None:
    if not path.is_file():
        raise ValueError(f"缺少数据库：{path}")
    with sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True) as connection:
        result = connection.execute("PRAGMA quick_check").fetchone()
    if result != ("ok",):
        raise ValueError(f"数据库完整性检查未通过：{result}")


def copy_data_dir(source: Path, destination: Path, database_name: str = "kaoyan.db") -> Path:
    source = source.expanduser().resolve()
    destination = destination.expanduser().resolve()
    if Path(database_name).name != database_name or not database_name.endswith(".db"):
        raise ValueError("数据库名称必须是数据目录内的 .db 文件名")
    if not source.is_dir():
        raise ValueError(f"源目录不存在：{source}")
    if destination.exists():
        raise ValueError(f"目标已存在，不会覆盖：{destination}")
    if destination.is_relative_to(source):
        raise ValueError("目标目录不能位于源目录之内")
    if any(path.is_symlink() for path in source.rglob("*")):
        raise ValueError("数据目录含符号链接，请先人工核对")
    _check_database(source / database_name)
    shutil.copytree(source, destination)
    _check_database(destination / database_name)
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--database-name", default="kaoyan.db", help="SQLite 文件名，默认 kaoyan.db")
    args = parser.parse_args()
    try:
        copied = copy_data_dir(args.source, args.destination, args.database_name)
    except (ValueError, OSError, sqlite3.DatabaseError) as error:
        parser.exit(1, f"复制未完成：{error}\n")
    print(f"数据目录已复制并校验：{copied}")
