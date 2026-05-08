# Sportingrisk Data Widget Prototype

A configurable widget suite delivering real-time football data to betting operator websites. Operators drop in a single embed tag per page template; the widget resolves context automatically, filters tabs by match phase (pre / live / full-time), and renders the relevant data.
## Quick start

**Without Docker:**
```bash
pip install -r server/requirements.txt
python3 server/app.py
open http://localhost:8080
```

**With Docker Compose:**
```bash
docker-compose up
# then open http://localhost:8080
```

## Pages available

| URL | What's there |
|---|---|
| `http://localhost:8080` | Landing page — links to all components |
| `http://localhost:8080/example/` | Operator example page (match widget, pre-configured) |
| `http://localhost:8080/config/` | Theming + config tool |
| `http://localhost:8080/api/v1/` | REST API (see `docs/api.md`) |
| `http://localhost:8080/healthz` | Health check |

## Project structure

```
server/          Python Tornado API server — mock data + endpoints
widget/          Vanilla JS widget (no build step, no framework)
  core/          Orchestrator, tab container, API client, config loader
  widgets/       One renderer per widget type (13 total)
config-tool/     Operator theming + configuration UI (Component 3)
example/         Polished operator example page (Component 4)
docs/            API reference
```

## The widget types

**General Information**

| Widget | Phase | Description |
|---|---|---|
| League Table | BOTH | Standings with live position-change indicators |
| Fixtures / Results | PRE | Next 5 upcoming + last 5 results |
| Squad List / Line-ups | BOTH | Pre-match squad → confirmed XI → live events |

**Stats**

| Widget | Phase | Description |
|---|---|---|
| Head-to-Head | PRE | Team comparison + player vs player |
| Team Stats | BOTH | Season/recency filters; live match stats at kick-off |

**Written**

| Widget | Phase | Description |
|---|---|---|
| Match Facts / Commentary | BOTH | Fact cards pre-match; live vidi-printer commentary |

## Widget availability by page type

| Widget | Match | Competition | Homepage |
|---|---|---|---|
| League Table | Yes | Yes | Pinned |
| Fixtures / Results | Yes | Yes | Pinned |
| Line-ups | Yes | — | Pinned |
| Head-to-Head | Yes | — | — |
| Team Stats | Yes | — | Pinned |
| Match Facts / Commentary | Yes | — | — |

Homepage widgets use a `pinned` context (a specific `match_id` or `competition_id`) set in `SR_CONFIG`.

## Operator configuration

Three customisation levels (mirrors spec §6):

- **L1** — Which widgets to enable per page type (tab list)
- **L2** — Tab visibility and which tab is shown by default
- **L3** — Per-widget behaviour options (row counts, chart styles, polling intervals, etc.)

Config is read from `window.SR_CONFIG` if present; otherwise the widget falls back to the defaults in `widget/core/config.js`. In production this becomes a server-side fetch: `GET /api/v1/config/{data-client}`.

**Embed snippet:**
```html
<!-- Match page template -->
<div id="sr-widget-root"></div>
<script src="https://widgets.sportingrisk.com/v1/loader.js"
  data-client="your-operator-id"
  data-page-type="match"
  data-match-id="{{page.match_id}}">
</script>

<!-- Optional: override config -->
<script>
window.SR_CONFIG = {
  match: {
    tabs: [{ id: "league_table", label: "Standings", default: true }],
    options: {
      league_table: { limit: 10, default_view: "overall" }
    }
  }
};
</script>
```

## Theming

Operators override CSS custom properties — no build step required:

```css
.sr-widget {
  --sr-color-primary: #2d5c2e;
  --sr-color-secondary: #f5a623;
  --sr-font-family: 'Roboto', sans-serif;
  --sr-border-radius: 6px;
}
```

The config tool at `/config/` provides a live preview and exports the CSS variable block ready to paste.

## Architecture notes

- **API server:** Python / Tornado (async). Mock data store designed to be swapped for ClickHouse + Redis in production. Every endpoint maps to one wide aggregate query keyed on `competition_id` or `match_id`.
- **Widget:** Vanilla ES modules — no framework, no build step, no bundler required.
- **Stateless:** No server-side sessions, no user data collected. Horizontally scalable.
- **Live data:** Client-side polling per widget on configurable intervals. Active tab drives the poll rate (commentary at 5 s, line-ups at 30 s, standings at 60 s). Polling only runs when the match phase is `live`.
- **Context polling:** Match context refreshes every 15 s. Phase transitions (pre → live → ft) update the header in place, show/hide phase-restricted tabs, and trigger a re-fetch on all mounted renderers.
- **Caching:** Deterministic ETags + per-data-class TTLs on the server. `If-None-Match` short-circuits unchanged payloads.
- **Dev mode:** `SR_DEV_MODE=1` (set in `docker-compose.yml`) enables `POST /api/v1/_dev/phase/{match_id}` for toggling match phase without a real data feed — used by the example page demo controls. Disabled in production.
