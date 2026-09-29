"""Small per-process, per-IP fixed-window limiter for local MVP endpoints."""

from threading import Lock
from time import monotonic


class RateLimiter:
    def __init__(self, window_seconds: int = 60) -> None:
        self.window_seconds = window_seconds
        self._hits: dict[tuple[str, str], tuple[float, int]] = {}
        self._lock = Lock()

    def check(self, client_ip: str, group: str, limit: int) -> int:
        """Return seconds until retry, or zero when the request is allowed."""
        now = monotonic()
        key = (client_ip, group)
        with self._lock:
            if len(self._hits) > 2048:
                self._hits = {item: value for item, value in self._hits.items() if now - value[0] < self.window_seconds}
            started, count = self._hits.get(key, (now, 0))
            if now - started >= self.window_seconds:
                started, count = now, 0
            if count >= limit:
                return max(1, int(started + self.window_seconds - now) + 1)
            self._hits[key] = (started, count + 1)
            return 0

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()
