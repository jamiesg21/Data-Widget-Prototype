# Data Widget Prototype

Configurable widget suite delivering real-time football data to betting operator websites — candidate prototype for the Sportingrisk AI Specialist role.

This repo proves the architecture end-to-end: a read-only Tornado API serving mock data with a production-shaped contract, an embeddable vanilla-JS widget with a tabbed single-container model, a CSS-variable theming system, and a standalone configuration tool.

## Quick start

```bash
docker-compose up
```

Then:

| URL | What |
|---|---|
| http://localhost:8080/example/ | Operator example match page (embedded widget) |
| http://localhost:8080/config/  | Theming tool (live preview + CSS-variable export) |
| http://localhost:8080/api/v1/context/match/ars-liv-2026-05-06 | API root example |
| http://localhost:8080/healthz  | Health check |

## Project structure

```
.
├── server/              # Tornado app, data store, mock fixtures, cache layer
│   ├── app.py           # Entry point, routing
│   ├── handlers/        # API request handlers (one module per endpoint group)
│   ├── store.py         # Data-store interface — drop-in replaceable with ClickHouse
│   ├── cache.py         # In-memory TTL cache (Redis-compatible interface)
│   └── data/            # JSON mock fixtures (competitions, teams, matches, fixtures)
├── widget/              # Embedded widget bundle (loader.js + renderers + CSS)
├── config-tool/         # Standalone theming page
├── example/             # Example operator match page
├── docs/api.md          # API contract — source of truth
├── Dockerfile
└── docker-compose.yml
```

## API

See `docs/api.md` for the full contract. Highlights:

- Read-only HTTP API at `/api/v1`. JSON, GET-only.
- Every response wrapped in a `{ data, meta }` envelope with `generated_at`, `ttl_seconds`, `phase`, and `context`.
- `Cache-Control` and deterministic `ETag` set on every response — `If-None-Match` short-circuits unchanged payloads.
- Per-data-class TTLs (standings 300s pre / 60s live, live commentary 5s, historical H2H 3600s, etc.).
- Designed to be drop-in replaceable with ClickHouse + cache: every endpoint maps to one wide aggregate query keyed on `competition_id` or `match_id`.

## Architectural constraints

Mirrors §2.2 of the technical spec:

- **No user data collection.** No analytics, no tracking, no PII.
- **Stateless / no server-side sessions.** Any session-like state lives in encrypted cookies on the client. Horizontally scalable — any request can be served by any instance.
- **AWS-deployable.** Designed for ECS/EC2 horizontal scaling. No shared mutable state between instances.

## Phase-transition demo

To demonstrate the pre-match → in-play widget transition without rebuilding fixtures, a dev-only endpoint flips a match's phase:

```bash
curl -X POST http://localhost:8080/api/v1/_dev/phase/ars-liv-2026-05-06 \
  -H "Content-Type: application/json" -d '{"phase":"live"}'
```

Gated by `SR_DEV_MODE=1` (set in `docker-compose.yml`). Disabled in production builds.

## Tech

| Component | Stack |
|---|---|
| API server | Python 3.12, Tornado 6 (async) |
| Widget + config tool | Vanilla JavaScript, CSS custom properties |
| Containerisation | Docker / Docker Compose |
