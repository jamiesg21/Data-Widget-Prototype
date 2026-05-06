/* Squad / Line-ups widget.
 *
 * State-aware (spec §3.1 III) — single endpoint, the response's `state`
 * field drives which view we render:
 *   pre_squad     — squad list grouped by position
 *   confirmed_xi  — starting XI + bench
 *   live          — XI + bench + live event icons (goals, cards, subs)
 */

const POSITION_LABELS = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" };
const POSITION_ORDER = ["GK", "DEF", "MID", "FWD"];

const EVENT_ICONS = {
  goal: "⚽",
  yellow_card: "🟨",
  red_card: "🟥",
  substitution: "🔄",
};

export default {
  async mount(panelEl, ctx) {
    this.ctx = ctx;
    this.panelEl = panelEl;
    await this._fetchAndRender();
  },

  async update(ctx) {
    this.ctx = ctx;
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
      this._render(env.data);
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load line-ups — ${escape(err.message)}</div>`;
    }
  },

  _render(data) {
    const state = data.state;
    const showXI = state === "confirmed_xi" || state === "live";
    const showEvents = state === "live";

    const formationLine = data.formation
      ? `<div class="sr-lineups__formation">Formation: ${escape(data.formation.home)} vs ${escape(data.formation.away)}</div>`
      : "";

    this.panelEl.innerHTML = `
      ${formationLine}
      <div class="sr-lineups">
        ${this._teamColumn(data.home, "home", showXI, showEvents)}
        ${this._teamColumn(data.away, "away", showXI, showEvents)}
      </div>
    `;
  },

  _teamColumn(team, side, showXI, showEvents) {
    const xi = showXI && team.starting_xi ? `
      <h4 class="sr-lineups__heading">Starting XI</h4>
      <ul class="sr-lineups__list">${team.starting_xi.map(this._playerRow).join("")}</ul>
    ` : "";

    const bench = showXI && team.bench ? `
      <h4 class="sr-lineups__heading">Bench</h4>
      <ul class="sr-lineups__list sr-lineups__list--muted">${team.bench.map(this._playerRow).join("")}</ul>
    ` : "";

    const squadGroups = !showXI && team.squad ? POSITION_ORDER.map((pos) => {
      const members = team.squad.filter((p) => p.position_group === pos);
      if (!members.length) return "";
      return `
        <h4 class="sr-lineups__heading">${POSITION_LABELS[pos]}</h4>
        <ul class="sr-lineups__list">${members.map(this._playerRow).join("")}</ul>
      `;
    }).join("") : "";

    const events = showEvents && team.events?.length ? `
      <h4 class="sr-lineups__heading">Events</h4>
      <ul class="sr-lineups__events">${team.events.map((e) => `
        <li><span class="sr-lineups__event-icon">${EVENT_ICONS[e.type] || "•"}</span>
          <span>${e.minute}'</span>
          <span>${escape(e.detail || e.type)}</span></li>
      `).join("")}</ul>
    ` : "";

    return `
      <section class="sr-lineups__col sr-lineups__col--${side}">
        <h3 class="sr-lineups__team">${escape(team.team_id.toUpperCase())}</h3>
        ${xi}${bench}${squadGroups}${events}
      </section>
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
