from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import start_lan  # noqa: E402


def test_lan_start_waits_for_health_before_opening_browser(tmp_path, monkeypatch) -> None:
    (tmp_path / "backend").mkdir()
    events = []

    class FakeServer:
        def poll(self):
            return None

        def wait(self, timeout=None):
            events.append("server-wait")

        def terminate(self):
            events.append("server-terminate")

    class HealthyResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *unused):
            return None

    monkeypatch.setattr(start_lan, "ROOT", tmp_path)
    monkeypatch.setattr(start_lan, "_port_available", lambda port: True)
    monkeypatch.setattr(start_lan, "_build_frontend", lambda: events.append("build"))
    monkeypatch.setattr(start_lan, "prepare_lan_secrets", lambda: {
        "JWT_SECRET": "test-jwt", "MODEL_CONFIG_SECRET": "test-model",
    })
    monkeypatch.setattr(start_lan.subprocess, "run", lambda *args, **kwargs: events.append("migration"))
    monkeypatch.setattr(start_lan.subprocess, "Popen", lambda *args, **kwargs: events.append("server-start") or FakeServer())
    monkeypatch.setattr(start_lan, "urlopen", lambda *args, **kwargs: HealthyResponse())
    monkeypatch.setattr(start_lan.webbrowser, "open", lambda url: events.append("browser-open"))
    monkeypatch.setattr(start_lan, "_local_ip", lambda: "192.168.1.10")
    monkeypatch.setenv("APP_PORT", "8013")

    start_lan.main()

    assert events == ["build", "migration", "server-start", "browser-open", "server-wait", "server-terminate", "server-wait"]
