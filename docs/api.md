# Data Widget API — v1

Read-only HTTP API serving widget data for the Sportingrisk data-widget suite.

This document is the source of truth for the API contract. Mock data is a stand-in
for the production ClickHouse + cache backend; **the contract is designed so that
swapping the backing store requires no changes to endpoint shape or response schema**.

---

## 1. Conventions

### Base
- Base path: `/api/v1`
- Method: `GET` only (the widget API is read-only; the sync service owns the write path)
- Content type: `application/json; charset=utf-8`
- IDs are opaque strings (e.g. `"epl"`, `"ars-liv-2026-05-06"`, `"saka"`). Treat as keys, not parsable values.

### Response envelope

Every response is wrapped in a thin envelope:

```json
{
  "data": { ... },
  "meta": {
    "generated_at": "2026-05-06T14:30:00Z",
    "ttl_seconds": 60,
    "phase": "pre",
    "context": {
      "competition_id": "epl",
      "match_id": "ars-liv-2026-05-06"
    }
  }
}
```

| Field | Description |
|---|---|
| `data` | The payload — schema defined per endpoint below. |
| `meta.generated_at` | ISO-8601 UTC timestamp of when the snapshot was produced. |
| `meta.ttl_seconds` | How long this payload may be cached client-side. Mirrors `Cache-Control: max-age`. |
| `meta.phase` | One of `pre`, `live`, `ft`, or `null` when not match-scoped. |
| `meta.context` | Echoes the resolved context — useful for client-side cache keying and debugging. |

Why an envelope: phase and TTL are payload-level concerns (different endpoints have different freshness needs even when called for the same match), and an envelope keeps that visible without forcing clients to read headers. Headers are still set as a secondary signal for CDNs.

### HTTP caching

Every response also carries:

```
Cache-Control: public, max-age=<ttl_seconds>
ETag: "<sha1 of data block>"
```

The `ETag` is deterministic for a given snapshot — clients (and the CDN layer) can use `If-None-Match` to short-circuit unchanged payloads.

### TTLs by data class

| Class | Example endpoints | TTL (pre) | TTL (live) | Reason |
|---|---|---|---|---|
| Slow-moving | `/competitions/{id}/standings`, `/teams/{id}/fixtures` | 300s | 60s | Standings only change on match-end |
| Match metadata | `/context/match/{id}` | 60s | 30s | Phase/score transitions |
| Lineups | `/matches/{id}/lineups` | 30s | 30s | XI confirmed ~1h before kickoff |
| Live tick data | `/matches/{id}/xg-timeline`, `/matches/{id}/commentary`, `/matches/{id}/team-stats` (live) | n/a | 5s | Per-event freshness |
| Historical | `/matches/{id}/h2h`, season averages | 3600s | 3600s | Static for the duration of a fixture |
| Match facts | `/matches/{id}/match-facts` | 1800s | 30s | Pre-match precomputed; live re-derives on events |

### Errors

```json
{
  "error": {
    "code": "not_found",
    "message": "match 'ars-liv-2026-99-99' does not exist"
  }
}
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `bad_request` | Missing/invalid query param |
| 404 | `not_found` | Unknown ID |
| 500 | `internal_error` | Unhandled server error |

---

## 2. Context resolution

The widget embed tag carries one of `data-competition-id`, `data-match-id`, or neither (homepage). The widget calls a context endpoint to expand that ID into the full set of IDs it needs (both teams, current phase, etc.) before fetching widget data.

### `GET /api/v1/context/match/{match_id}`

Resolves a match ID into its full context.

**Response `data`:**
```json
{
  "match_id": "ars-liv-2026-05-06",
  "competition_id": "epl",
  "season": "2025-26",
  "kickoff_at": "2026-05-06T19:30:00Z",
  "phase": "pre",
  "status": "scheduled",
  "minute": null,
  "home": { "team_id": "ars", "name": "Arsenal", "short_name": "ARS", "score": null },
  "away": { "team_id": "liv", "name": "Liverpool", "short_name": "LIV", "score": null }
}
```

When `phase` is `"live"`: `minute` is an integer (1–90+), `score.home` and `score.away` are integers, `status` is `"in_play"`.

### `GET /api/v1/context/competition/{competition_id}`

```json
{
  "competition_id": "epl",
  "name": "Premier League",
  "country": "England",
  "season": "2025-26"
}
```

---

## 3. Widget endpoints

All widget endpoints take their primary ID (`competition_id` / `match_id` / `team_id`) in the path. Query parameters control display options that map directly to the widget's per-page-type configuration.

### 3.1 League table — `GET /api/v1/competitions/{competition_id}/standings`

| Query param | Values | Default | Notes |
|---|---|---|---|
| `view` | `overall` \| `home` \| `away` | `overall` | Matches widget option "Default view" |
| `limit` | int 1–25 | none | Matches widget option "Rows shown" |

**Response `data`:**
```json
{
  "view": "overall",
  "rows": [
    {
      "position": 1,
      "team": { "team_id": "ars", "name": "Arsenal", "short_name": "ARS", "crest_url": null },
      "played": 35, "won": 24, "drawn": 7, "lost": 4,
      "goals_for": 78, "goals_against": 28, "goal_difference": 50,
      "points": 79,
      "form": ["W","W","D","W","W"],
      "position_change": 0
    }
  ]
}
```

`position_change` is `+/-` movement since kick-off of any active in-play match. Drives the "position-change indicator" specified in §3.1 of the technical spec. `0` when no in-play match affects the table.

### 3.2 Fixtures / results — `GET /api/v1/teams/{team_id}/fixtures`

| Query param | Values | Default |
|---|---|---|
| `upcoming` | int 0–10 | 5 |
| `past` | int 0–10 | 5 |

**Response `data`:**
```json
{
  "team_id": "ars",
  "upcoming": [
    {
      "match_id": "ars-liv-2026-05-06",
      "competition_id": "epl",
      "kickoff_at": "2026-05-06T19:30:00Z",
      "home": { "team_id": "ars", "short_name": "ARS" },
      "away": { "team_id": "liv", "short_name": "LIV" },
      "venue": "home"
    }
  ],
  "past": [
    {
      "match_id": "ars-bha-2026-04-27",
      "competition_id": "epl",
      "kickoff_at": "2026-04-27T14:00:00Z",
      "home": { "team_id": "ars", "short_name": "ARS", "score": 2 },
      "away": { "team_id": "bha", "short_name": "BHA", "score": 1 },
      "result": "W",
      "venue": "home"
    }
  ]
}
```

### 3.3 Squad / Line-ups — `GET /api/v1/matches/{match_id}/lineups`

State-aware: a single endpoint that handles squad → confirmed XI → live progression. The `state` field in the response tells the widget which view to render.

**Response `data`:**
```json
{
  "state": "pre_squad",
  "formation": null,
  "home": {
    "team_id": "ars",
    "squad": [
      {
        "player_id": "saka",
        "name": "Bukayo Saka",
        "shirt": 7,
        "position_group": "FWD",
        "season_stats": { "appearances": 32, "goals": 14, "assists": 9 }
      }
    ],
    "starting_xi": null,
    "bench": null,
    "events": null
  },
  "away": { "...": "..." }
}
```

| `state` | What's populated | Phase trigger |
|---|---|---|
| `pre_squad` | `squad` only | Pre-match, XI not yet confirmed |
| `confirmed_xi` | `squad`, `starting_xi`, `bench`, `formation` | ~1h before kickoff |
| `live` | All of above plus `events[]` (goals, cards, subs with `minute`) | At kick-off and after |

`events[]` shape:
```json
{ "type": "goal", "minute": 23, "player_id": "saka", "detail": "right-foot" }
```

### 3.4 Team stats — `GET /api/v1/matches/{match_id}/team-stats`

| Query param | Values | Default |
|---|---|---|
| `recency` | `season` \| `last5` \| `last10` \| `home_away` | `season` |
| `categories` | `all` \| `attacking` \| `defensive` | `all` |

**Response `data` (pre-match):**
```json
{
  "phase": "pre",
  "recency": "season",
  "home": {
    "team_id": "ars",
    "stats": {
      "goals_per_game": 2.23,
      "shots_per_game": 15.8,
      "shots_on_target_per_game": 5.9,
      "possession_pct": 58.2,
      "xg_per_game": 1.91,
      "clean_sheets": 12,
      "goals_conceded_per_game": 0.80
    }
  },
  "away": { "...": "..." }
}
```

**Response `data` (in-play, when called with `recency=live`):**
```json
{
  "phase": "live",
  "recency": "live",
  "minute": 67,
  "home": { "team_id": "ars", "stats": { "shots": 12, "shots_on_target": 5, "possession_pct": 54, "corners": 6, "fouls": 8, "yellow_cards": 1, "red_cards": 0 } },
  "away": { "...": "..." }
}
```

### 3.5 Head-to-head — `GET /api/v1/matches/{match_id}/h2h`

| Query param | Values | Default |
|---|---|---|
| `depth` | int 1–20 | 10 |

**Response `data`:**
```json
{
  "depth": 10,
  "summary": {
    "home_wins": 4, "away_wins": 3, "draws": 3,
    "home_goals": 14, "away_goals": 11,
    "avg_goals_per_game": 2.5
  },
  "recent": [
    {
      "match_id": "liv-ars-2026-01-12",
      "kickoff_at": "2026-01-12T16:30:00Z",
      "home": { "team_id": "liv", "score": 1 },
      "away": { "team_id": "ars", "score": 2 }
    }
  ]
}
```

### 3.6 Player vs player — `GET /api/v1/matches/{match_id}/h2h/players`

| Query param | Required | Notes |
|---|---|---|
| `a` | yes | `player_id` of left player |
| `b` | yes | `player_id` of right player |

**Response `data`:**
```json
{
  "season": "2025-26",
  "a": {
    "player_id": "saka",
    "name": "Bukayo Saka",
    "team_id": "ars",
    "stats": { "appearances": 32, "goals": 14, "assists": 9, "shots_per_90": 3.2, "key_passes_per_90": 2.4, "xg": 11.8 }
  },
  "b": { "...": "..." }
}
```

### 3.7 xG race graph — `GET /api/v1/matches/{match_id}/xg-timeline`

Hidden pre-match (returns `data: null`). Activates at kick-off.

**Response `data` (in-play):**
```json
{
  "minute_now": 67,
  "home": {
    "team_id": "ars",
    "cumulative": [
      { "minute": 8,  "xg": 0.12, "is_goal": false },
      { "minute": 23, "xg": 0.78, "is_goal": true  },
      { "minute": 41, "xg": 1.05, "is_goal": false }
    ],
    "total_xg": 1.05
  },
  "away": { "...": "..." }
}
```

Cumulative array is stepwise — each entry includes the running xG total *after* that shot. Goal markers are flagged inline so the chart can render them without a second request.

### 3.8 Match facts — `GET /api/v1/matches/{match_id}/match-facts`

| Query param | Values | Default |
|---|---|---|
| `category` | `all` \| `match` \| `team` \| `player` | `all` |

**Response `data` (pre-match):**
```json
{
  "phase": "pre",
  "match": [
    "Arsenal have won 6 of their last 8 home league matches against Liverpool.",
    "These two sides have produced an average of 3.2 goals per meeting in the last 5 matches."
  ],
  "team": {
    "ars": ["Arsenal have kept a clean sheet in 7 of their last 10 home matches."],
    "liv": ["Liverpool have scored in 13 consecutive away league games."]
  },
  "player": {
    "saka": ["Saka has the highest shot accuracy in Arsenal's squad this season (54%)."]
  }
}
```

### 3.9 Live commentary — `GET /api/v1/matches/{match_id}/commentary`

| Query param | Values | Default |
|---|---|---|
| `since` | ISO-8601 timestamp | omitted = full feed |
| `limit` | int 1–50 | 25 |

**Response `data`:**
```json
{
  "phase": "live",
  "minute_now": 67,
  "items": [
    {
      "id": "evt-0142",
      "minute": 67,
      "timestamp": "2026-05-06T20:37:14Z",
      "type": "shot_on_target",
      "team_id": "ars",
      "player_id": "martinelli",
      "text": "67' Martinelli forces a low save from Alisson, the rebound hooked clear by Van Dijk."
    }
  ]
}
```

`since` returns only items newer than the timestamp — the only delta-style endpoint in the API. Everything else returns whole snapshots (deterministic, cache-friendly).

---

## 4. Phase-transition endpoint (development only)

Available only when `SR_DEV_MODE=1`. Used by the example page to demonstrate the pre-match → in-play transition.

`POST /api/v1/_dev/phase/{match_id}` with body `{"phase": "pre" | "live" | "ft"}`.

Returns `204 No Content`. Subsequent reads of any endpoint scoped to that match reflect the new phase. Disabled in production.

---

## 5. Page-type → endpoint matrix

Maps the spec's three page-type contexts to the endpoints the widget calls.

| Page type | Context endpoint | Then calls |
|---|---|---|
| Match | `/context/match/{match_id}` | `/competitions/{cid}/standings`, `/teams/{home}/fixtures`, `/matches/{mid}/lineups`, `/matches/{mid}/team-stats`, `/matches/{mid}/h2h`, `/matches/{mid}/xg-timeline`, `/matches/{mid}/match-facts`, `/matches/{mid}/commentary` |
| Competition | `/context/competition/{competition_id}` | `/competitions/{cid}/standings`, `/teams/{tid}/fixtures` (one per team in scope) |
| Homepage | none | Per-widget pinned IDs from operator config (out of prototype scope) |

---

## 6. Drop-in replacement story

Each endpoint above maps to a single ClickHouse aggregate query keyed on `competition_id` or `match_id`, behind the cache layer. The mock implementation honours the same contract: stable URLs, deterministic payloads, identical response shapes. Replacing `server/data/` (file-based loader) with a ClickHouse client will not require changes to handlers, headers, or schemas.
