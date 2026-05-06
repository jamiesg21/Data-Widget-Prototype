"""Context resolution endpoints — /api/v1/context/*."""

from __future__ import annotations

from server.handlers.base import APIHandler
from server.store import ttl_for


class MatchContextHandler(APIHandler):
    def get(self, match_id: str) -> None:
        ctx = self.store.match_context(match_id)
        if ctx is None:
            return self.fail(404, "not_found", f"match '{match_id}' does not exist")
        self.respond(
            ctx,
            ttl=ttl_for("context_match", ctx["phase"]),
            phase=ctx["phase"],
            context={"match_id": match_id, "competition_id": ctx["competition_id"]},
        )


class CompetitionContextHandler(APIHandler):
    def get(self, competition_id: str) -> None:
        ctx = self.store.competition_context(competition_id)
        if ctx is None:
            return self.fail(404, "not_found", f"competition '{competition_id}' does not exist")
        self.respond(
            ctx,
            ttl=ttl_for("context_competition", None),
            phase=None,
            context={"competition_id": competition_id},
        )
