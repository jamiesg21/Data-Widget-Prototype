"""Widget data endpoints — /api/v1/competitions/...  /matches/...  /teams/..."""

from __future__ import annotations

from server.handlers.base import APIHandler
from server.store import ttl_for


def _phase_or_none(handler: APIHandler, match_id: str) -> str | None:
    return handler.store.get_phase(match_id)


class StandingsHandler(APIHandler):
    def get(self, competition_id: str) -> None:
        view = self.get_choice("view", ("overall", "home", "away"), "overall")
        if view is None:
            return
        limit = self.get_int("limit", default=None, lo=1, hi=25) if self.get_query_argument("limit", None) else None
        data = self.store.standings(competition_id, view, limit)
        if data is None:
            return self.fail(404, "not_found", f"competition '{competition_id}' does not exist")
        self.respond(
            data,
            ttl=ttl_for("standings", "pre"),
            phase=None,
            context={"competition_id": competition_id},
        )


class TeamFixturesHandler(APIHandler):
    def get(self, team_id: str) -> None:
        upcoming = self.get_int("upcoming", default=5, lo=0, hi=10)
        past = self.get_int("past", default=5, lo=0, hi=10)
        if upcoming is None or past is None:
            return
        data = self.store.team_fixtures(team_id, upcoming, past)
        if data is None:
            return self.fail(404, "not_found", f"team '{team_id}' has no fixtures recorded")
        self.respond(data, ttl=ttl_for("fixtures", None), phase=None, context={"team_id": team_id})


class LineupsHandler(APIHandler):
    def get(self, match_id: str) -> None:
        data = self.store.lineups(match_id)
        if data is None:
            return self.fail(404, "not_found", f"match '{match_id}' does not exist")
        phase = _phase_or_none(self, match_id)
        self.respond(data, ttl=ttl_for("lineups", phase), phase=phase, context={"match_id": match_id})


class TeamStatsHandler(APIHandler):
    def get(self, match_id: str) -> None:
        recency = self.get_choice("recency", ("season", "last5", "last10", "home_away", "live"), "season")
        if recency is None:
            return
        categories = self.get_choice("categories", ("all", "attacking", "defensive"), "all")
        if categories is None:
            return
        data = self.store.team_stats(match_id, recency, categories)
        if data is None:
            phase = _phase_or_none(self, match_id)
            if phase != "live" and recency == "live":
                return self.fail(400, "bad_request", "recency=live requires phase=live")
            return self.fail(404, "not_found", f"match '{match_id}' does not exist")
        ttl_category = "team_stats_live" if recency == "live" else "team_stats_pre"
        self.respond(data, ttl=ttl_for(ttl_category, data["phase"]), phase=data["phase"], context={"match_id": match_id})


class H2HHandler(APIHandler):
    def get(self, match_id: str) -> None:
        depth = self.get_int("depth", default=10, lo=1, hi=20)
        if depth is None:
            return
        data = self.store.h2h(match_id, depth)
        if data is None:
            return self.fail(404, "not_found", f"match '{match_id}' does not exist")
        self.respond(data, ttl=ttl_for("h2h", None), phase=None, context={"match_id": match_id})


class PlayerH2HHandler(APIHandler):
    def get(self, match_id: str) -> None:
        a = self.get_query_argument("a", None)
        b = self.get_query_argument("b", None)
        if not a or not b:
            return self.fail(400, "bad_request", "query params 'a' and 'b' are required")
        data = self.store.player_h2h(match_id, a, b)
        if data is None:
            return self.fail(404, "not_found", "match or player not found")
        self.respond(data, ttl=ttl_for("player_h2h", None), phase=None, context={"match_id": match_id})


class XGTimelineHandler(APIHandler):
    def get(self, match_id: str) -> None:
        phase = _phase_or_none(self, match_id)
        if phase is None:
            return self.fail(404, "not_found", f"match '{match_id}' does not exist")
        data = self.store.xg_timeline(match_id)  # None when pre-match
        ttl_category = "xg_timeline" if phase != "pre" else "match_facts"  # cheap fallback for pre TTL
        self.respond(
            data,
            ttl=ttl_for(ttl_category, phase) if phase != "pre" else 60,
            phase=phase,
            context={"match_id": match_id},
        )


class MatchFactsHandler(APIHandler):
    def get(self, match_id: str) -> None:
        category = self.get_choice("category", ("all", "match", "team", "player"), "all")
        if category is None:
            return
        data = self.store.match_facts(match_id, category)
        if data is None:
            return self.fail(404, "not_found", f"match '{match_id}' does not exist")
        phase = _phase_or_none(self, match_id)
        self.respond(data, ttl=ttl_for("match_facts", phase), phase=phase, context={"match_id": match_id})


class CommentaryHandler(APIHandler):
    def get(self, match_id: str) -> None:
        since = self.get_query_argument("since", None)
        limit = self.get_int("limit", default=25, lo=1, hi=50)
        if limit is None:
            return
        data = self.store.commentary(match_id, since, limit)
        if data is None:
            return self.fail(404, "not_found", f"match '{match_id}' does not exist")
        phase = _phase_or_none(self, match_id)
        self.respond(data, ttl=ttl_for("commentary", phase) if phase != "pre" else 60, phase=phase, context={"match_id": match_id})
