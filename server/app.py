"""Tornado entry point.

One Tornado service serves:
  - /api/v1/*   — read-only widget data API
  - /widget/*   — embedded widget JS/CSS (loader.js, widget.js, widget.css)
  - /config     — standalone theming tool
  - /example    — example operator match page

Stateless: no server-side sessions. Any session-like state lives in
encrypted cookies on the client. Horizontally scalable — any request
can be served by any instance.
"""

from __future__ import annotations

import os
from pathlib import Path

import tornado.ioloop
import tornado.web

from server.cache import TTLCache
from server.handlers.context import CompetitionContextHandler, MatchContextHandler
from server.handlers.dev import DevPhaseHandler
from server.handlers.widgets import (
    CommentaryHandler,
    H2HHandler,
    LineupsHandler,
    MatchFactsHandler,
    PlayerH2HHandler,
    StandingsHandler,
    TeamFixturesHandler,
    TeamStatsHandler,
    XGTimelineHandler,
)
from server.store import DataStore

ROOT = Path(__file__).parent.parent
WIDGET_DIR = ROOT / "widget"
CONFIG_DIR = ROOT / "config-tool"
EXAMPLE_DIR = ROOT / "example"


class StaticPageHandler(tornado.web.StaticFileHandler):
    """Serves a default file (index.html) at the directory root."""

    async def get(self, path: str = "") -> None:
        if path == "" or path.endswith("/"):
            path = (path + "index.html").lstrip("/")
        await super().get(path)


def make_app() -> tornado.web.Application:
    store = DataStore()
    cache = TTLCache()
    dev_mode = os.environ.get("SR_DEV_MODE", "0") == "1"

    deps = {"store": store, "cache": cache}

    routes = [
        # API — context
        (r"/api/v1/context/match/([^/]+)",         MatchContextHandler,        deps),
        (r"/api/v1/context/competition/([^/]+)",   CompetitionContextHandler,  deps),

        # API — widget data
        (r"/api/v1/competitions/([^/]+)/standings",     StandingsHandler,    deps),
        (r"/api/v1/teams/([^/]+)/fixtures",             TeamFixturesHandler, deps),
        (r"/api/v1/matches/([^/]+)/lineups",            LineupsHandler,      deps),
        (r"/api/v1/matches/([^/]+)/team-stats",         TeamStatsHandler,    deps),
        (r"/api/v1/matches/([^/]+)/h2h",                H2HHandler,          deps),
        (r"/api/v1/matches/([^/]+)/h2h/players",        PlayerH2HHandler,    deps),
        (r"/api/v1/matches/([^/]+)/xg-timeline",        XGTimelineHandler,   deps),
        (r"/api/v1/matches/([^/]+)/match-facts",        MatchFactsHandler,   deps),
        (r"/api/v1/matches/([^/]+)/commentary",         CommentaryHandler,   deps),

        # Dev — phase toggle
        (r"/api/v1/_dev/phase/([^/]+)", DevPhaseHandler, {**deps, "dev_mode": dev_mode}),

        # Static — widget bundle, config tool, example page
        (r"/widget/(.*)",  tornado.web.StaticFileHandler, {"path": str(WIDGET_DIR)}),
        (r"/config/?(.*)", StaticPageHandler,             {"path": str(CONFIG_DIR), "default_filename": "index.html"}),
        (r"/example/?(.*)",StaticPageHandler,             {"path": str(EXAMPLE_DIR), "default_filename": "index.html"}),

        # Health
        (r"/healthz", HealthHandler),
    ]

    return tornado.web.Application(
        routes,
        debug=os.environ.get("SR_DEBUG", "0") == "1",
    )


class HealthHandler(tornado.web.RequestHandler):
    def get(self) -> None:
        self.write({"status": "ok"})


def main() -> None:
    port = int(os.environ.get("SR_PORT", 8080))
    app = make_app()
    app.listen(port)
    print(f"sr-widget API listening on :{port} (dev_mode={os.environ.get('SR_DEV_MODE','0')})")
    tornado.ioloop.IOLoop.current().start()


if __name__ == "__main__":
    main()
