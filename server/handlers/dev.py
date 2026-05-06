"""Dev-only phase toggle — gated by SR_DEV_MODE env var.

Lets the example page demonstrate the pre-match → in-play transition
without rebuilding fixtures. Disabled in production.
"""

from __future__ import annotations

import json

from server.handlers.base import APIHandler


class DevPhaseHandler(APIHandler):
    def initialize(self, store=None, cache=None, dev_mode: bool = False) -> None:
        super().initialize(store=store, cache=cache)
        self.dev_mode = dev_mode

    def post(self, match_id: str) -> None:
        if not self.dev_mode:
            return self.fail(404, "not_found", "endpoint disabled")
        try:
            body = json.loads(self.request.body or b"{}")
        except json.JSONDecodeError:
            return self.fail(400, "bad_request", "body must be JSON")
        phase = body.get("phase")
        if phase not in ("pre", "live", "ft"):
            return self.fail(400, "bad_request", "phase must be one of pre, live, ft")
        if not self.store.set_phase(match_id, phase):
            return self.fail(404, "not_found", f"match '{match_id}' does not exist")
        # Drop cached snapshots scoped to this match.
        if self.cache is not None:
            self.cache.invalidate_prefix(f"match:{match_id}:")
        self.set_status(204)
        self.finish()
