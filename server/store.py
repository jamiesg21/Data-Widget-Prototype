"""Data store interface + file-backed mock implementation.

The store is the single seam between the API handlers and the backing
data source. Today the implementation reads JSON fixtures from disk;
in production it would issue ClickHouse queries behind the same method
signatures. Handlers depend only on this interface.

Phase state for each match is mutable in-memory so the dev
phase-toggle endpoint can flip pre → live → ft for the example page
demo. This is a prototype-only affordance — in production the phase
is read directly from the analytical store.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).parent / "data"

# Phase-aware TTL table (seconds). Mirrors docs/api.md §1 TTL matrix.
TTL = {
    "context_match":       {"pre": 60,   "live": 30,   "ft": 300},
    "context_competition": {"any": 3600},
    "standings":           {"pre": 300,  "live": 60,   "ft": 300},
    "fixtures":            {"any": 300},
    "lineups":             {"pre": 30,   "live": 30,   "ft": 300},
    "team_stats_pre":      {"any": 600},
    "team_stats_live":     {"live": 5},
    "h2h":                 {"any": 3600},
    "player_h2h":          {"any": 3600},
    "xg_timeline":         {"live": 5,   "ft": 3600},
    "match_facts":         {"pre": 1800, "live": 30,   "ft": 1800},
    "commentary":          {"live": 5,   "ft": 1800},
}


def ttl_for(category: str, phase: str | None) -> int:
    table = TTL[category]
    if "any" in table:
        return table["any"]
    return table.get(phase or "pre", 60)


class DataStore:
    """File-backed mock implementation of the widget data store."""

    def __init__(self) -> None:
        self._competitions = json.loads((DATA_DIR / "competitions.json").read_text())
        self._teams = json.loads((DATA_DIR / "teams.json").read_text())
        self._matches = json.loads((DATA_DIR / "matches.json").read_text())
        self._fixtures = json.loads((DATA_DIR / "fixtures.json").read_text())
        self._phase_overrides: dict[str, str] = {}

    # ---- phase ----

    def get_phase(self, match_id: str) -> str | None:
        match = self._matches.get(match_id)
        if match is None:
            return None
        return self._phase_overrides.get(match_id, match["phase"])

    def set_phase(self, match_id: str, phase: str) -> bool:
        if match_id not in self._matches or phase not in ("pre", "live", "ft"):
            return False
        self._phase_overrides[match_id] = phase
        return True

    # ---- context ----

    def match_context(self, match_id: str) -> dict[str, Any] | None:
        match = self._matches.get(match_id)
        if match is None:
            return None
        phase = self.get_phase(match_id)
        home = self._teams[match["home"]["team_id"]]
        away = self._teams[match["away"]["team_id"]]
        score = self._derive_score(match, phase)
        minute = self._derive_minute(match, phase)
        status = {"pre": "scheduled", "live": "in_play", "ft": "finished"}[phase]
        return {
            "match_id": match["match_id"],
            "competition_id": match["competition_id"],
            "season": match["season"],
            "kickoff_at": match["kickoff_at"],
            "phase": phase,
            "status": status,
            "minute": minute,
            "home": {"team_id": home["team_id"], "name": home["name"], "short_name": home["short_name"], "score": score["home"]},
            "away": {"team_id": away["team_id"], "name": away["name"], "short_name": away["short_name"], "score": score["away"]},
        }

    def competition_context(self, competition_id: str) -> dict[str, Any] | None:
        comp = self._competitions.get(competition_id)
        if comp is None:
            return None
        return {
            "competition_id": comp["competition_id"],
            "name": comp["name"],
            "country": comp["country"],
            "season": comp["season"],
        }

    # ---- standings ----

    def standings(self, competition_id: str, view: str, limit: int | None) -> dict[str, Any] | None:
        comp = self._competitions.get(competition_id)
        if comp is None:
            return None
        rows = []
        for entry in comp["standings"]:
            team = self._teams.get(entry["team_id"], {})
            rows.append({
                "position": entry["position"],
                "team": {
                    "team_id": entry["team_id"],
                    "name": team.get("name", entry["team_id"]),
                    "short_name": team.get("short_name", entry["team_id"].upper()),
                    "crest_url": None,
                },
                "played": entry["played"],
                "won": entry["won"],
                "drawn": entry["drawn"],
                "lost": entry["lost"],
                "goals_for": entry["goals_for"],
                "goals_against": entry["goals_against"],
                "goal_difference": entry["goals_for"] - entry["goals_against"],
                "points": entry["points"],
                "form": entry["form"],
                "position_change": 0,
            })
        if limit is not None:
            rows = rows[:limit]
        return {"view": view, "rows": rows}

    # ---- fixtures ----

    def team_fixtures(self, team_id: str, upcoming: int, past: int) -> dict[str, Any] | None:
        f = self._fixtures.get(team_id)
        if f is None:
            return None
        return {
            "team_id": team_id,
            "upcoming": f["upcoming"][:upcoming],
            "past": f["past"][:past],
        }

    # ---- lineups ----

    def lineups(self, match_id: str) -> dict[str, Any] | None:
        match = self._matches.get(match_id)
        if match is None:
            return None
        phase = self.get_phase(match_id)
        lu = match["lineups"]
        state = {"pre": "confirmed_xi", "live": "live", "ft": "live"}[phase]
        # Simulate "squad list only" by stripping XI when no formation has been decided.
        # Our mock data always has the XI, so confirmed_xi is the pre-match default.
        # A finer simulation would have a separate "pre_squad" toggle — kept simple here.
        home_squad = self._squad_for_team(match["home"]["team_id"])
        away_squad = self._squad_for_team(match["away"]["team_id"])
        events = lu["events"] if phase != "pre" else None
        if phase != "pre":
            # filter to events that have already occurred relative to current minute
            minute_now = self._derive_minute(match, phase) or 0
            events = [e for e in lu["events"] if e["minute"] <= minute_now]
        return {
            "state": state,
            "formation": lu["formation"] if state != "pre_squad" else None,
            "home": {
                "team_id": match["home"]["team_id"],
                "squad": home_squad,
                "starting_xi": self._players(lu["home"]["starting_xi"]) if state != "pre_squad" else None,
                "bench":       self._players(lu["home"]["bench"])       if state != "pre_squad" else None,
                "events": [e for e in (events or []) if e["team_id"] == match["home"]["team_id"]] if events is not None else None,
            },
            "away": {
                "team_id": match["away"]["team_id"],
                "squad": away_squad,
                "starting_xi": self._players(lu["away"]["starting_xi"]) if state != "pre_squad" else None,
                "bench":       self._players(lu["away"]["bench"])       if state != "pre_squad" else None,
                "events": [e for e in (events or []) if e["team_id"] == match["away"]["team_id"]] if events is not None else None,
            },
        }

    # ---- team stats ----

    def team_stats(self, match_id: str, recency: str, categories: str) -> dict[str, Any] | None:
        match = self._matches.get(match_id)
        if match is None:
            return None
        phase = self.get_phase(match_id)

        if recency == "live":
            if phase != "live":
                return None  # handler returns 400; live tab only valid in-play
            ls = match["team_stats_live"]
            return {
                "phase": "live",
                "recency": "live",
                "minute": self._derive_minute(match, phase),
                "home": {"team_id": match["home"]["team_id"], "stats": ls["home"]},
                "away": {"team_id": match["away"]["team_id"], "stats": ls["away"]},
            }

        ts = match["team_stats_pre"][recency]
        home_stats = self._teams[match["home"]["team_id"]]["season_stats"] if ts["home"] == "season_default" else ts["home"]
        away_stats = self._teams[match["away"]["team_id"]]["season_stats"] if ts["away"] == "season_default" else ts["away"]
        if categories != "all":
            home_stats = self._filter_stats(home_stats, categories)
            away_stats = self._filter_stats(away_stats, categories)
        return {
            "phase": phase,
            "recency": recency,
            "home": {"team_id": match["home"]["team_id"], "stats": home_stats},
            "away": {"team_id": match["away"]["team_id"], "stats": away_stats},
        }

    # ---- h2h ----

    def h2h(self, match_id: str, depth: int) -> dict[str, Any] | None:
        match = self._matches.get(match_id)
        if match is None:
            return None
        h = match["h2h"]
        return {
            "depth": depth,
            "summary": h["summary"],
            "recent": h["recent"][:depth],
        }

    def player_h2h(self, match_id: str, player_a: str, player_b: str) -> dict[str, Any] | None:
        match = self._matches.get(match_id)
        if match is None:
            return None
        a = self._find_player(player_a)
        b = self._find_player(player_b)
        if a is None or b is None:
            return None
        return {
            "season": match["season"],
            "a": {"player_id": a["player_id"], "name": a["name"], "team_id": a["team_id"], "stats": a["season_stats"]},
            "b": {"player_id": b["player_id"], "name": b["name"], "team_id": b["team_id"], "stats": b["season_stats"]},
        }

    # ---- xG timeline ----

    def xg_timeline(self, match_id: str) -> dict[str, Any] | None:
        match = self._matches.get(match_id)
        if match is None:
            return None
        phase = self.get_phase(match_id)
        if phase == "pre":
            return None  # handler returns data: null
        xg = match["xg_timeline"]
        minute_now = self._derive_minute(match, phase) or 90
        return {
            "minute_now": minute_now,
            "home": {
                "team_id": xg["home"]["team_id"],
                "cumulative": [p for p in xg["home"]["cumulative"] if p["minute"] <= minute_now],
                "total_xg": next((p["xg"] for p in reversed(xg["home"]["cumulative"]) if p["minute"] <= minute_now), 0.0),
            },
            "away": {
                "team_id": xg["away"]["team_id"],
                "cumulative": [p for p in xg["away"]["cumulative"] if p["minute"] <= minute_now],
                "total_xg": next((p["xg"] for p in reversed(xg["away"]["cumulative"]) if p["minute"] <= minute_now), 0.0),
            },
        }

    # ---- match facts ----

    def match_facts(self, match_id: str, category: str) -> dict[str, Any] | None:
        match = self._matches.get(match_id)
        if match is None:
            return None
        mf = match["match_facts"]
        out: dict[str, Any] = {"phase": self.get_phase(match_id)}
        if category in ("all", "match"):
            out["match"] = mf["match"]
        if category in ("all", "team"):
            out["team"] = mf["team"]
        if category in ("all", "player"):
            out["player"] = mf["player"]
        return out

    # ---- commentary ----

    def commentary(self, match_id: str, since: str | None, limit: int) -> dict[str, Any] | None:
        match = self._matches.get(match_id)
        if match is None:
            return None
        phase = self.get_phase(match_id)
        if phase == "pre":
            return {"phase": "pre", "minute_now": None, "items": []}
        minute_now = self._derive_minute(match, phase) or 90
        items = [c for c in match["commentary"] if c["minute"] <= minute_now]
        if since is not None:
            items = [c for c in items if c["timestamp"] > since]
        # Newest first, capped to limit.
        items = list(reversed(items))[:limit]
        return {"phase": phase, "minute_now": minute_now, "items": items}

    # ---- helpers ----

    def _derive_score(self, match: dict, phase: str) -> dict[str, int | None]:
        if phase == "pre":
            return {"home": None, "away": None}
        # Count goal events up to current minute.
        minute_now = self._derive_minute(match, phase) or 90
        goals = [e for e in match["lineups"]["events"] if e["type"] == "goal" and e["minute"] <= minute_now]
        return {
            "home": sum(1 for g in goals if g["team_id"] == match["home"]["team_id"]),
            "away": sum(1 for g in goals if g["team_id"] == match["away"]["team_id"]),
        }

    def _derive_minute(self, match: dict, phase: str) -> int | None:
        if phase == "pre":
            return None
        if phase == "ft":
            return 90
        # Live: use the captured live snapshot minute from team_stats_live.
        return match.get("team_stats_live", {}).get("minute", 67)

    def _squad_for_team(self, team_id: str) -> list[dict]:
        team = self._teams.get(team_id, {})
        return team.get("squad", [])

    def _players(self, ids: list[str]) -> list[dict]:
        out = []
        for pid in ids:
            p = self._find_player(pid)
            if p is not None:
                out.append({
                    "player_id": p["player_id"],
                    "name": p["name"],
                    "shirt": p["shirt"],
                    "position_group": p["position_group"],
                })
        return out

    def _find_player(self, player_id: str) -> dict | None:
        for team in self._teams.values():
            for player in team.get("squad", []):
                if player["player_id"] == player_id:
                    return {**player, "team_id": team["team_id"]}
        return None

    def _filter_stats(self, stats: dict, category: str) -> dict:
        attacking_keys = {"goals_per_game", "shots_per_game", "shots_on_target_per_game", "xg_per_game", "corners_per_game"}
        defensive_keys = {"clean_sheets", "goals_conceded_per_game", "xga_per_game", "fouls_per_game"}
        keep = attacking_keys if category == "attacking" else defensive_keys
        return {k: v for k, v in stats.items() if k in keep}
