from pathlib import Path

from app.core.config import PROJECT_ROOT, Settings


def test_default_and_isolated_data_roots(tmp_path: Path):
    assert Settings(database_url="", data_root="").resolved_data_root == PROJECT_ROOT / "data"
    isolated = tmp_path / "test.db"
    assert Settings(database_url=f"sqlite:///{isolated}", data_root="").resolved_data_root == tmp_path
    custom = tmp_path / "other"
    assert Settings(database_url=f"sqlite:///{isolated}", data_root=str(custom)).resolved_data_root == custom
