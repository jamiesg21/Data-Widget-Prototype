/* Widget orchestrator.
 *
 * Resolves context, renders the shell (header + tabs), mounts widget
 * renderers as tabs are activated, and drives polling for live tabs.
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
const LIVE_DATA_POLL_MS = 10000;   // refresh active live tab every 10s

export class Widget {
  constructor({ rootEl, apiBase, pageType, matchId, competitionId, devMode }) {
    this.rootEl = rootEl;
    this.api = new ApiClient(apiBase);
    this.pageType = pageType;
    this.matchId = matchId;
    this.competitionId = competitionId;
    this.devMode = devMode;

    this.config = loadConfig(pageType);
    this.context = null;            // current resolved context (match or competition)
    this.tabContainer = null;
    this.renderers = new Map();     // tab id -> { mount, update, destroy }
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
      this.context = { page_type: "homepage" };
    }
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
    // Hide phase-incompatible tabs (xG race pre-match, etc.) — driven by the
    // tab's id. The full mapping is loose for the prototype; production reads
    // it from the server-side widget metadata.
    const phase = this.context?.phase;
    return this.config.tabs.filter((t) => {
      if (phase === "pre"  && (t.id === "xg_timeline")) return false;
      // commentary-only tabs would also be hidden pre-match in a richer impl
      return true;
    });
  }

  async _activateTab(tabId, panelEl) {
    let renderer = this.renderers.get(tabId);
    if (!renderer) {
      renderer = await this._loadRenderer(tabId);
      if (!renderer) {
        panelEl.innerHTML = `<div class="sr-widget__error">No renderer for "${escape(tabId)}"</div>`;
        return;
      }
      this.renderers.set(tabId, renderer);
      try {
        await renderer.mount(panelEl, this._rendererContext(tabId));
      } catch (err) {
        console.error(`[sr-widget] mount failed for ${tabId}`, err);
        panelEl.innerHTML = `<div class="sr-widget__error">Failed to load — ${escape(err.message)}</div>`;
      }
    }
    this._scheduleDataPoll();
  }

  async _loadRenderer(tabId) {
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
    return {
      api: this.api,
      context: this.context,
      options: this.config.options[tabId] || {},
      pageType: this.pageType,
    };
  }

  _scheduleContextPoll() {
    if (this._contextTimer) clearInterval(this._contextTimer);
    this._contextTimer = setInterval(() => this._tickContext(), CONTEXT_POLL_MS);
  }

  async _tickContext() {
    if (this.pageType !== "match") return;
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
    this._dataTimer = setInterval(() => this._tickData(), LIVE_DATA_POLL_MS);
  }

  async _tickData() {
    if (this.context?.phase !== "live") return; // only poll widgets while live
    const activeId = this.tabContainer?.activeId;
    const renderer = activeId ? this.renderers.get(activeId) : null;
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
