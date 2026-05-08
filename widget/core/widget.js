/* Widget orchestrator.
 *
 * Resolves context, renders the shell (header + tabs), mounts widget
 * renderers as tabs are activated, and drives polling for live tabs.
 *
 * Tabs are pre-fetched in parallel after the shell renders (spec §2.3) —
 * each renderer mounts into its hidden panel so the first click on any
 * tab feels instant. Mounts are idempotent (promise-cached) so the
 * default tab's activation and the prefetch loop share the same fetch.
 *
 * Context model (spec §2.4):
 *   - Match page    → one match context, fetched once and re-polled.
 *   - Competition   → one competition context, fetched once.
 *   - Homepage      → no URL context. Each tab carries its own pinned
 *                     { competition_id } or { match_id } in SR_CONFIG;
 *                     each pinned context is resolved separately and
 *                     stored per-tab in _contextByTab. Pinned match
 *                     contexts are re-polled so phase transitions for
 *                     a homepage's pinned live match still propagate.
 *
 * Phase transitions (pre → live → ft) are handled by the context-poll
 * loop: when the phase changes, the header updates in place, hidden
 * tabs become visible (or vice-versa), and active widgets re-fetch.
 */

import { ApiClient } from "./api.js";
import { loadConfig } from "./config.js";
import { renderHeader, updateHeader } from "./header.js";
import { TabContainer } from "./tabs.js";

const CONTEXT_POLL_MS = 15000;     // refresh match context every 15s

// Per-widget default poll intervals (ms) for live data — match the server's
// per-data-class TTLs (see server/store.py). Operators override these via
// SR_CONFIG.{pageType}.options.{tabId}.poll_ms (spec §2.5.1, §2.5.3).
// Pre-match-only widgets have 0 → no live polling needed.
const DEFAULT_POLL_MS = {
  league_table:      60000,
  fixtures:          0,
  lineups:           30000,
  team_stats:        30000,
  h2h:               0,
  xg_timeline:       15000,
  match_facts:       5000,
  attacking_thirds:  30000,
  shot_map:          15000,
  pass_networks:     0,
  momentum_tracker:  60000,
  average_positions: 0,
  bet_prompts:       30000,
};

// Per-tab phase restrictions.  "pre" = shown only pre-match; "live" = shown
// only when in-play.  Tabs not listed here are always visible.
const TAB_PHASES = {
  fixtures:          "pre",
  h2h:               "pre",
  pass_networks:     "pre",
  average_positions: "pre",
  xg_timeline:       "live",
  momentum_tracker:  "live",
};

export class Widget {
  constructor({ rootEl, apiBase, pageType, matchId, competitionId, devMode }) {
    this.rootEl = rootEl;
    this.api = new ApiClient(apiBase);
    this.pageType = pageType;
    this.matchId = matchId;
    this.competitionId = competitionId;
    this.devMode = devMode;

    this.config = loadConfig(pageType);
    this.context = null;            // top-level context (match or competition); placeholder for homepage
    this.tabContainer = null;
    this.renderers = new Map();     // tab id -> { mount, update, destroy }
    this._mountPromises = new Map();// tab id -> in-flight (or settled) mount promise
    this._contextByTab = new Map(); // tab id -> resolved context (per-tab pinned for homepage)
    this._contextTimer = null;
    this._dataTimer = null;
  }

  async start() {
    this.rootEl.classList.add("sr-widget");
    this.rootEl.innerHTML = `<div class="sr-widget__loading">Loading widget…</div>`;

    try {
      await this._resolveContext();
      this._renderShell();
      this._scheduleContextPoll();
      this._prefetchVisibleTabs();
    } catch (err) {
      console.error("[sr-widget] failed to start", err);
      this.rootEl.innerHTML = `<div class="sr-widget__error">Widget failed to load — ${escape(err.message)}</div>`;
    }
  }

  async _resolveContext() {
    if (this.pageType === "match") {
      const env = await this.api.get(`/context/match/${encodeURIComponent(this.matchId)}`);
      this.context = env.data;
    } else if (this.pageType === "competition") {
      const env = await this.api.get(`/context/competition/${encodeURIComponent(this.competitionId)}`);
      this.context = env.data;
    } else {
      // Homepage — no URL context. Pre-resolve each tab's pinned context
      // (spec §2.4.5) in parallel so renderers can read it on mount.
      this.context = { page_type: "homepage" };
      await this._resolvePinnedContexts();
    }
  }

  // Resolves SR_CONFIG.homepage.tabs[].pinned for every tab that has one,
  // populating _contextByTab. Failures are logged but don't abort the
  // widget — affected tabs will fall back to the placeholder context and
  // their renderer will surface its own error.
  async _resolvePinnedContexts() {
    const promises = [];
    for (const tab of this.config.tabs) {
      if (!tab.pinned) continue;
      promises.push(
        this._fetchPinnedContext(tab.pinned)
          .then((ctx) => { if (ctx) this._contextByTab.set(tab.id, ctx); })
          .catch((err) => console.warn(`[sr-widget] pinned-context fetch failed for ${tab.id}`, err))
      );
    }
    await Promise.all(promises);
  }

  async _fetchPinnedContext(pinned) {
    if (pinned.match_id) {
      const env = await this.api.get(`/context/match/${encodeURIComponent(pinned.match_id)}`);
      return env.data;
    }
    if (pinned.competition_id) {
      const env = await this.api.get(`/context/competition/${encodeURIComponent(pinned.competition_id)}`);
      return env.data;
    }
    return null;
  }

  _renderShell() {
    this.rootEl.innerHTML = "";

    if (this.pageType === "match") {
      const headerEl = document.createElement("div");
      this.rootEl.appendChild(headerEl);
      renderHeader(headerEl, this.context);
      this._headerEl = headerEl;
    }

    const tabsRoot = document.createElement("div");
    this.rootEl.appendChild(tabsRoot);

    const visibleTabs = this._visibleTabs();
    this.tabContainer = new TabContainer(tabsRoot, visibleTabs, (tabId, panelEl) => {
      this._activateTab(tabId, panelEl);
    });
  }

  _visibleTabs() {
    const phase = this.context?.phase;
    return this.config.tabs.filter((t) => {
      const p = TAB_PHASES[t.id];
      if (!p) return true;
      if (p === "pre"  && phase === "live") return false;
      if (p === "live" && phase !== "live") return false;
      return true;
    });
  }

  async _activateTab(tabId, panelEl) {
    await this._mountRenderer(tabId, panelEl);
    this._scheduleDataPoll();
  }

  // Idempotent mount — repeated calls for the same tabId return the same
  // in-flight (or settled) promise, so the default-tab activation and the
  // prefetch loop don't double-fetch.
  _mountRenderer(tabId, panelEl) {
    if (this._mountPromises.has(tabId)) return this._mountPromises.get(tabId);

    const promise = (async () => {
      const renderer = await this._loadRenderer(tabId);
      if (!renderer) {
        panelEl.innerHTML = `<div class="sr-widget__error">No renderer for "${escape(tabId)}"</div>`;
        return null;
      }
      try {
        await renderer.mount(panelEl, this._rendererContext(tabId));
        this.renderers.set(tabId, renderer);
        return renderer;
      } catch (err) {
        console.error(`[sr-widget] mount failed for ${tabId}`, err);
        panelEl.innerHTML = `<div class="sr-widget__error">Failed to load — ${escape(err.message)}</div>`;
        return null;
      }
    })();
    this._mountPromises.set(tabId, promise);
    return promise;
  }

  // Mount every visible tab in parallel after the shell is up. Hidden
  // panels (display: none) accept innerHTML fine; the active panel paints
  // first because it's the only one visible. SVG charts use a fixed
  // viewBox so they scale correctly when their panel becomes visible.
  _prefetchVisibleTabs() {
    if (!this.tabContainer) return;
    for (const tab of this._visibleTabs()) {
      const panelEl = this.tabContainer.panelFor(tab.id);
      if (panelEl) {
        this._mountRenderer(tab.id, panelEl).catch((err) => {
          console.warn(`[sr-widget] prefetch failed for ${tab.id}`, err);
        });
      }
    }
  }

  async _loadRenderer(tabId) {
    // All renderers live in ../widgets/{id}.js — the dynamic import covers
    // both the original 7 and the 6 new stubs added in §4.
    const KNOWN_WIDGETS = new Set([
      "league_table", "fixtures", "lineups", "h2h", "team_stats",
      "xg_timeline", "match_facts",
      "attacking_thirds", "shot_map", "pass_networks",
      "momentum_tracker", "average_positions", "bet_prompts",
    ]);
    if (!KNOWN_WIDGETS.has(tabId)) {
      console.warn(`[sr-widget] unknown tab id "${tabId}"`);
      return null;
    }
    try {
      switch (tabId) {
        case "league_table":    return (await import("../widgets/league_table.js")).default;
        case "fixtures":        return (await import("../widgets/fixtures.js")).default;
        case "lineups":         return (await import("../widgets/lineups.js")).default;
        case "team_stats":      return (await import("../widgets/team_stats.js")).default;
        case "h2h":             return (await import("../widgets/h2h.js")).default;
        case "xg_timeline":     return (await import("../widgets/xg_timeline.js")).default;
        case "match_facts":     return (await import("../widgets/match_facts.js")).default;
        case "attacking_thirds":   return (await import("../widgets/attacking_thirds.js")).default;
        case "shot_map":           return (await import("../widgets/shot_map.js")).default;
        case "pass_networks":      return (await import("../widgets/pass_networks.js")).default;
        case "momentum_tracker":   return (await import("../widgets/momentum_tracker.js")).default;
        case "average_positions":  return (await import("../widgets/average_positions.js")).default;
        case "bet_prompts":        return (await import("../widgets/bet_prompts.js")).default;
        default: {
          console.warn(`[sr-widget] no renderer module for ${tabId}`);
          return null;
        }
      }
    } catch (err) {
      console.warn(`[sr-widget] no renderer module for ${tabId}`, err);
      return null;
    }
  }

  _rendererContext(tabId) {
    // Per-tab context (homepage pinned) wins; otherwise the page-level context.
    const context = this._contextByTab.get(tabId) || this.context;
    return {
      api: this.api,
      context,
      options: this.config.options[tabId] || {},
      pageType: this.pageType,
    };
  }

  _scheduleContextPoll() {
    if (this._contextTimer) clearInterval(this._contextTimer);
    this._contextTimer = setInterval(() => this._tickContext(), CONTEXT_POLL_MS);
  }

  async _tickContext() {
    if (this.pageType === "match") {
      try {
        const env = await this.api.get(`/context/match/${encodeURIComponent(this.matchId)}`);
        const previousPhase = this.context.phase;
        this.context = env.data;
        if (this._headerEl) updateHeader(this._headerEl, this.context);
        if (this.context.phase !== previousPhase) {
          this._onPhaseChange(previousPhase, this.context.phase);
        }
      } catch (err) {
        console.warn("[sr-widget] context refresh failed", err);
      }
    } else if (this.pageType === "homepage") {
      await this._refreshPinnedContexts();
    }
    // Competition page-type has no phase/score to track here — standings
    // changes propagate via the live data poll on the active tab.
  }

  // Re-fetch every pinned context. If a pinned match flipped phase, run
  // update() on the corresponding renderer so its panel reflects the new
  // state (e.g. pre-match → live transition while sitting on the homepage).
  async _refreshPinnedContexts() {
    const phaseChangedTabs = [];
    const promises = [];
    for (const tab of this.config.tabs) {
      if (!tab.pinned) continue;
      const previous = this._contextByTab.get(tab.id);
      const previousPhase = previous?.phase;
      promises.push(
        this._fetchPinnedContext(tab.pinned)
          .then((ctx) => {
            if (!ctx) return;
            this._contextByTab.set(tab.id, ctx);
            if (ctx.phase !== previousPhase) phaseChangedTabs.push(tab.id);
          })
          .catch((err) => console.warn(`[sr-widget] pinned refresh failed for ${tab.id}`, err))
      );
    }
    await Promise.all(promises);
    for (const tabId of phaseChangedTabs) {
      const renderer = this.renderers.get(tabId);
      if (renderer && renderer.update) {
        renderer.update(this._rendererContext(tabId)).catch((err) =>
          console.warn(`[sr-widget] update failed for ${tabId}`, err)
        );
      }
    }
  }

  _onPhaseChange(from, to) {
    console.info(`[sr-widget] phase ${from} → ${to}`);
    if (this.tabContainer) {
      this.tabContainer.setVisibleTabs(this._visibleTabs().map((t) => t.id));
    }
    // Force-refresh all already-mounted renderers so they redraw for the new phase.
    for (const [tabId, renderer] of this.renderers) {
      if (renderer.update) {
        renderer.update(this._rendererContext(tabId)).catch((err) => {
          console.warn(`[sr-widget] update failed for ${tabId}`, err);
        });
      }
    }
  }

  _scheduleDataPoll() {
    if (this._dataTimer) clearInterval(this._dataTimer);
    const interval = this._pollIntervalForTab(this.tabContainer?.activeId);
    if (interval > 0) {
      this._dataTimer = setInterval(() => this._tickData(), interval);
    }
  }

  // Per-widget poll interval — operator override wins, then per-widget default,
  // then 0 (no polling). Called on every tab activation so switching tabs
  // re-rates the timer (commentary 5s, season-stats 30s, standings 60s, etc.).
  _pollIntervalForTab(tabId) {
    if (!tabId) return 0;
    const opts = this.config.options[tabId] || {};
    if (typeof opts.poll_ms === "number") return Math.max(0, opts.poll_ms);
    return DEFAULT_POLL_MS[tabId] || 0;
  }

  async _tickData() {
    // Poll the active tab's renderer if its context is live. For match
    // page-type, that's the page-level context; for homepage, it's the
    // pinned context for the active tab.
    const activeId = this.tabContainer?.activeId;
    if (!activeId) return;
    const activeContext = this._contextByTab.get(activeId) || this.context;
    if (activeContext?.phase !== "live") return;

    const renderer = this.renderers.get(activeId);
    if (renderer && renderer.update) {
      try {
        await renderer.update(this._rendererContext(activeId));
      } catch (err) {
        console.warn(`[sr-widget] data refresh failed for ${activeId}`, err);
      }
    }
  }

  destroy() {
    if (this._contextTimer) clearInterval(this._contextTimer);
    if (this._dataTimer) clearInterval(this._dataTimer);
    for (const renderer of this.renderers.values()) {
      if (renderer.destroy) renderer.destroy();
    }
  }
}

function escape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
