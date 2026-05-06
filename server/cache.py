"""In-memory TTL cache.

Demonstrates the cache-friendly contract: stable keys, deterministic
payloads, per-class TTLs. In production this is swapped for Redis with
identical semantics — `get`/`set`/`invalidate` cover the surface a
distributed cache needs.
"""

from __future__ import annotations

import threading
import time
from typing import Any


class TTLCache:
    """Thread-safe TTL cache. Per-key expiry, lazy eviction on read."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at < time.time():
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        with self._lock:
            self._store[key] = (time.time() + ttl_seconds, value)

    def invalidate_prefix(self, prefix: str) -> int:
        """Remove all keys starting with `prefix`. Returns count removed.

        Used by the dev phase-toggle endpoint to drop stale snapshots
        for a specific match. In production, the sync service would
        invalidate keys via a write-through / pub-sub mechanism.
        """
        with self._lock:
            keys = [k for k in self._store if k.startswith(prefix)]
            for k in keys:
                self._store.pop(k, None)
            return len(keys)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
