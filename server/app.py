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
    AttackingThirdsHandler,
    AveragePositionsHandler,
    BetPromptsHandler,
    CommentaryHandler,
    CompetitionFixturesHandler,
    H2HHandler,
    LineupsHandler,
    MatchFactsHandler,
    MomentumHandler,
    PassNetworksHandler,
    PlayerH2HHandler,
    ShotMapHandler,
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
        (r"/api/v1/competitions/([^/]+)/standings",     StandingsHandler,           deps),
        (r"/api/v1/competitions/([^/]+)/fixtures",      CompetitionFixturesHandler, deps),
        (r"/api/v1/teams/([^/]+)/fixtures",             TeamFixturesHandler,        deps),
        (r"/api/v1/matches/([^/]+)/lineups",            LineupsHandler,      deps),
        (r"/api/v1/matches/([^/]+)/team-stats",         TeamStatsHandler,    deps),
        (r"/api/v1/matches/([^/]+)/h2h",                H2HHandler,          deps),
        (r"/api/v1/matches/([^/]+)/h2h/players",        PlayerH2HHandler,    deps),
        (r"/api/v1/matches/([^/]+)/xg-timeline",        XGTimelineHandler,   deps),
        (r"/api/v1/matches/([^/]+)/match-facts",        MatchFactsHandler,       deps),
        (r"/api/v1/matches/([^/]+)/commentary",         CommentaryHandler,       deps),
        (r"/api/v1/matches/([^/]+)/attacking-thirds",   AttackingThirdsHandler,  deps),
        (r"/api/v1/matches/([^/]+)/shot-map",           ShotMapHandler,          deps),
        (r"/api/v1/matches/([^/]+)/pass-networks",      PassNetworksHandler,     deps),
        (r"/api/v1/matches/([^/]+)/momentum",           MomentumHandler,         deps),
        (r"/api/v1/matches/([^/]+)/average-positions",  AveragePositionsHandler, deps),
        (r"/api/v1/matches/([^/]+)/bet-prompts",        BetPromptsHandler,       deps),

        # Dev — phase toggle
        (r"/api/v1/_dev/phase/([^/]+)", DevPhaseHandler, {**deps, "dev_mode": dev_mode}),

        # Static — widget bundle, config tool, example page
        (r"/widget/(.*)",  tornado.web.StaticFileHandler, {"path": str(WIDGET_DIR)}),
        (r"/config/?(.*)", StaticPageHandler,             {"path": str(CONFIG_DIR), "default_filename": "index.html"}),
        (r"/example/?(.*)",StaticPageHandler,             {"path": str(EXAMPLE_DIR), "default_filename": "index.html"}),

        # Health
        (r"/healthz", HealthHandler),

        # Root landing page — quick links to example, config tool, API docs
        (r"/", IndexHandler),
    ]

    return tornado.web.Application(
        routes,
        debug=os.environ.get("SR_DEBUG", "0") == "1",
    )


class HealthHandler(tornado.web.RequestHandler):
    def get(self) -> None:
        self.write({"status": "ok"})


class IndexHandler(tornado.web.RequestHandler):
    def get(self) -> None:
        self.set_header("Content-Type", "text/html; charset=utf-8")
        self.write("""<!doctype html>
<html><head><meta charset="utf-8"><title>Sportingrisk Widget Prototype</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 24px; color: #1a1a1a; }
  h1 { margin-bottom: 4px; }
  p.lead { color: #6b7280; margin-top: 0; }
  ul { line-height: 1.8; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
</style></head>
<body>
  <h1>Sportingrisk Widget Prototype</h1>
  <p class="lead">Configurable football data widget suite.</p>
  <ul>
    <li><a href="/example/">Example operator page</a> — embedded widget on a match-page context</li>
    <li><a href="/config/">Theming tool</a> — live preview + CSS-variable export</li>
    <li><a href="/api/v1/context/match/ars-liv-2026-05-06">API sample</a> — match context endpoint</li>
    <li><a href="/healthz">Health check</a></li>
  </ul>
  <p>Source: <code>github.com/jamiesg21/Data-Widget-Prototype</code> · Docs: <code>/docs/api.md</code> in the repo</p>
</body></html>""")


def main() -> None:
    port = int(os.environ.get("SR_PORT", 8080))
    app = make_app()
    app.listen(port)
    print(f"sr-widget API listening on :{port} (dev_mode={os.environ.get('SR_DEV_MODE','0')})")
    tornado.ioloop.IOLoop.current().start()


if __name__ == "__main__":
    main()
