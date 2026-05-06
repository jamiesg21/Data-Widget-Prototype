"""Base handler — envelope, ETag, Cache-Control, error shape.

All API handlers extend this. The contract enforced here matches
docs/api.md §1 (response envelope, headers, error shape).
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from tornado.web import RequestHandler


class APIHandler(RequestHandler):
    """Base for /api/v1/* handlers."""

    def initialize(self, store=None, cache=None) -> None:
        self.store = store
        self.cache = cache

    def set_default_headers(self) -> None:
        self.set_header("Content-Type", "application/json; charset=utf-8")
        # CORS — operators embed the widget cross-origin. Read-only API.
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.set_header("Access-Control-Allow-Headers", "If-None-Match")

    def options(self, *args, **kwargs) -> None:
        self.set_status(204)
        self.finish()

    # ---- envelope ----

    def respond(self, data: Any, *, ttl: int, phase: str | None, context: dict[str, Any] | None = None) -> None:
        body = {
            "data": data,
            "meta": {
                "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "ttl_seconds": ttl,
                "phase": phase,
                "context": context or {},
            },
        }
        payload = json.dumps(data, separators=(",", ":"), sort_keys=True).encode()
        etag = '"' + hashlib.sha1(payload).hexdigest() + '"'
        if self.request.headers.get("If-None-Match") == etag:
            self.set_status(304)
            self.set_header("ETag", etag)
            self.set_header("Cache-Control", f"public, max-age={ttl}")
            self.finish()
            return
        self.set_header("ETag", etag)
        self.set_header("Cache-Control", f"public, max-age={ttl}")
        self.write(body)

    # ---- errors ----

    def fail(self, status: int, code: str, message: str) -> None:
        self.set_status(status)
        self.write({"error": {"code": code, "message": message}})

    def write_error(self, status_code: int, **kwargs: Any) -> None:
        code = {400: "bad_request", 404: "not_found"}.get(status_code, "internal_error")
        self.write({"error": {"code": code, "message": self._reason}})

    # ---- query param parsing ----

    def get_int(self, name: str, default: int, lo: int, hi: int) -> int | None:
        raw = self.get_query_argument(name, None)
        if raw is None:
            return default
        try:
            value = int(raw)
        except ValueError:
            self.fail(400, "bad_request", f"'{name}' must be an integer")
            return None
        if not (lo <= value <= hi):
            self.fail(400, "bad_request", f"'{name}' must be between {lo} and {hi}")
            return None
        return value

    def get_choice(self, name: str, choices: tuple[str, ...], default: str) -> str | None:
        value = self.get_query_argument(name, default)
        if value not in choices:
            self.fail(400, "bad_request", f"'{name}' must be one of {list(choices)}")
            return None
        return value
