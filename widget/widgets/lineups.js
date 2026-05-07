/* Squad / Line-ups widget.
 *
 * Spec §3.1 III — single widget, lifecycle-aware data, user-pickable sub-tabs:
 *   Squad list           (PRE only)        — full squad grouped by position
 *   Confirmed XI         (PRE only)        — starting XI
 *   Live formation+events(LIVE / FT)        — XI + filtered event icons
 *   Bench                (BOTH)            — bench list
 *
 * Sub-tabs disabled per phase are dimmed; default tab adapts to phase.
 * Single API call powers every view — squad / starting_xi / bench / events
 * are all in the response. No re-fetch on sub-tab switch.
 *
 * `event_icons` option filters which event types render in the live view:
 *   "goals_cards_subs" (default) | "goals_cards" | "all"
 */

const POSITION_LABELS = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" };
const POSITION_ORDER = ["GK", "DEF", "MID", "FWD"];

const EVENT_ICONS = {
  goal: "⚽",
  yellow_card: "🟨",
  red_card: "🟥",
  substitution: "🔄",
};

// Sub-tab catalogue. `phases` lists which phases the tab is selectable in;
// outside those, the pill is disabled.
const SUB_TABS = [
  { id: "squad",  label: "Squad list",     phases: ["pre"] },
  { id: "xi",     label: "Confirmed XI",   phases: ["pre"] },
  { id: "live",   label: "Live + events",  phases: ["live", "ft"] },
  { id: "bench",  label: "Bench",          phases: ["pre", "live", "ft"] },
];

const EVENT_FILTERS = {
  goals_cards_subs: new Set(["goal", "yellow_card", "red_card", "substitution"]),
  goals_cards:      new Set(["goal", "yellow_card", "red_card"]),
  all:              null,   // null = show every event
};

export default {
  async mount(panelEl, ctx) {
    this.ctx = ctx;
    this.panelEl = panelEl;
    this.eventFilter = ctx.options.event_icons || "goals_cards_subs";
    this.subTab = null;       // resolved on first render based on phase
    this._data = null;
    await this._fetchAndRender();
  },

  async update(ctx) {
    this.ctx = ctx;
    this.eventFilter = ctx.options.event_icons || this.eventFilter;
    await this._fetchAndRender();
  },

  async _fetchAndRender() {
    const matchId = this.ctx.context.match_id;
    if (!matchId) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">No match in context</div>`;
      return;
    }
    this.panelEl.innerHTML = `<div class="sr-widget__loading">Loading line-ups…</div>`;
    try {
      const env = await this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/lineups`);
      this._data = env.data;
      this._render();
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load line-ups — ${escape(err.message)}</div>`;
    }
  },

  _render() {
    const data = this._data;
    if (!data) return;
    const phase = this.ctx.context.phase || "pre";
    this.subTab = this._pickSubTab(phase);

    const pills = SUB_TABS.map((t) => {
      const allowed = t.phases.includes(phase);
      const active = t.id === this.subTab;
      return `<button type="button" class="sr-pill ${active ? "sr-pill--active" : ""}" data-sub="${t.id}" ${allowed ? "" : "disabled"}>${escape(t.label)}</button>`;
    }).join("");

    const formationLine = data.formation && (this.subTab === "xi" || this.subTab === "live")
      ? `<div class="sr-lineups__formation">Formation: ${escape(data.formation.home)} vs ${escape(data.formation.away)}</div>`
      : "";

    this.panelEl.innerHTML = `
      <div class="sr-toolbar">
        <div class="sr-pill-group">${pills}</div>
      </div>
      ${formationLine}
      <div class="sr-lineups">
        ${this._teamColumn(data.home, "home")}
        ${this._teamColumn(data.away, "away")}
      </div>
    `;

    this.panelEl.querySelectorAll(".sr-pill[data-sub]").forEach((b) => {
      b.addEventListener("click", () => {
        if (b.disabled) return;
        this.subTab = b.dataset.sub;
        this._render();
      });
    });
  },

  // Pick a sub-tab valid for the current phase. Keeps the user's selection if
  // it's still allowed; otherwise falls back to a sensible default per phase.
  _pickSubTab(phase) {
    if (this.subTab) {
      const def = SUB_TABS.find((t) => t.id === this.subTab);
      if (def && def.phases.includes(phase)) return this.subTab;
    }
    if (phase === "pre")  return "xi";
    if (phase === "live" || phase === "ft") return "live";
    return SUB_TABS[0].id;
  },

  _teamColumn(team, side) {
    const teamHeader = `<h3 class="sr-lineups__team">${escape(team.team_id.toUpperCase())}</h3>`;

    if (this.subTab === "squad") {
      const groups = POSITION_ORDER.map((pos) => {
        const members = (team.squad || []).filter((p) => p.position_group === pos);
        if (!members.length) return "";
        return `
          <h4 class="sr-lineups__heading">${POSITION_LABELS[pos]}</h4>
          <ul class="sr-lineups__list">${members.map(this._playerRow).join("")}</ul>
        `;
      }).join("");
      return `<section class="sr-lineups__col sr-lineups__col--${side}">${teamHeader}${groups}</section>`;
    }

    if (this.subTab === "xi" || this.subTab === "live") {
      const xi = (team.starting_xi || []).map(this._playerRow).join("");
      const xiBlock = xi
        ? `<h4 class="sr-lineups__heading">Starting XI</h4><ul class="sr-lineups__list">${xi}</ul>`
        : `<div class="sr-widget__empty">XI not yet confirmed.</div>`;
      const events = this.subTab === "live" ? this._eventsBlock(team) : "";
      return `<section class="sr-lineups__col sr-lineups__col--${side}">${teamHeader}${xiBlock}${events}</section>`;
    }

    if (this.subTab === "bench") {
      const bench = (team.bench || []).map(this._playerRow).join("");
      const block = bench
        ? `<h4 class="sr-lineups__heading">Bench</h4><ul class="sr-lineups__list sr-lineups__list--muted">${bench}</ul>`
        : `<div class="sr-widget__empty">Bench not yet announced.</div>`;
      return `<section class="sr-lineups__col sr-lineups__col--${side}">${teamHeader}${block}</section>`;
    }

    return `<section class="sr-lineups__col sr-lineups__col--${side}">${teamHeader}</section>`;
  },

  _eventsBlock(team) {
    const allowedTypes = EVENT_FILTERS[this.eventFilter];
    let events = team.events || [];
    if (allowedTypes) events = events.filter((e) => allowedTypes.has(e.type));
    if (!events.length) return "";
    return `
      <h4 class="sr-lineups__heading">Events</h4>
      <ul class="sr-lineups__events">${events.map((e) => `
        <li><span class="sr-lineups__event-icon">${EVENT_ICONS[e.type] || "•"}</span>
          <span>${e.minute}'</span>
          <span>${escape(e.detail || e.type)}</span></li>
      `).join("")}</ul>
    `;
  },

  _playerRow(p) {
    return `
      <li class="sr-lineups__player">
        <span class="sr-lineups__shirt">${p.shirt}</span>
        <span class="sr-lineups__name">${escape(p.name)}</span>
        <span class="sr-lineups__pos">${escape(p.position_group)}</span>
      </li>
    `;
  },
};

function escape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
