/* Fixtures / results widget.
 *
 * Pre-match only (spec §3.1 II). Shows next N upcoming and last N
 * results for the contextually-resolved team.
 */

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
    // Two scopes per spec §3.1 II: focal-team fixtures (match context — focal
    // team is the home side) or competition-wide fixtures (competition or
    // match-less context). Detection uses the resolved context shape.
    const teamId = this.ctx.context.home?.team_id;
    const competitionId = this.ctx.context.competition_id;
    const upcoming = this.ctx.options.upcoming ?? 5;
    const past = this.ctx.options.past ?? 5;

    this.panelEl.innerHTML = `<div class="sr-widget__loading">Loading fixtures…</div>`;

    try {
      let env, focal;
      if (teamId) {
        env = await this.ctx.api.get(`/teams/${encodeURIComponent(teamId)}/fixtures`, { upcoming, past });
        focal = teamId;
      } else if (competitionId) {
        env = await this.ctx.api.get(`/competitions/${encodeURIComponent(competitionId)}/fixtures`, { upcoming, past });
        focal = null;  // no focal team at competition scope — no row highlight or W/L chip
      } else {
        this.panelEl.innerHTML = `<div class="sr-widget__error">No team or competition in context</div>`;
        return;
      }
      this._render(env.data, focal);
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load fixtures — ${escape(err.message)}</div>`;
    }
  },

  _render(data, focalTeamId) {
    const upcoming = (data.upcoming || []).map((m) => this._row(m, focalTeamId, false)).join("");
    const past = (data.past || []).map((m) => this._row(m, focalTeamId, true)).join("");

    this.panelEl.innerHTML = `
      <div class="sr-fixtures">
        <section class="sr-fixtures__col">
          <h4 class="sr-fixtures__heading">Upcoming</h4>
          <ul class="sr-fixtures__list">${upcoming || `<li class="sr-fixtures__empty">No fixtures.</li>`}</ul>
        </section>
        <section class="sr-fixtures__col">
          <h4 class="sr-fixtures__heading">Recent</h4>
          <ul class="sr-fixtures__list">${past || `<li class="sr-fixtures__empty">No results.</li>`}</ul>
        </section>
      </div>
    `;
  },

  _row(m, focalTeamId, isPast) {
    const d = new Date(m.kickoff_at);
    const date = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const home = m.home;
    const away = m.away;
    const score = isPast
      ? `<span class="sr-fixtures__score">${home.score}-${away.score}</span>`
      : `<span class="sr-fixtures__time">${time}</span>`;
    // Result chip is focal-team-perspective; competition scope has no result field.
    const result = isPast && m.result
      ? `<span class="sr-fixtures__result sr-fixtures__result--${m.result.toLowerCase()}">${escape(m.result)}</span>`
      : "";

    const hasFocal = !!focalTeamId;
    const focalIsHome = hasFocal && home.team_id === focalTeamId;
    const focalIsAway = hasFocal && away.team_id === focalTeamId;
    return `
      <li class="sr-fixtures__row">
        <span class="sr-fixtures__date">${date}</span>
        <span class="sr-fixtures__teams">
          <span class="sr-fixtures__team ${focalIsHome ? "is-focal" : ""}">${escape(home.short_name)}</span>
          ${score}
          <span class="sr-fixtures__team ${focalIsAway ? "is-focal" : ""}">${escape(away.short_name)}</span>
        </span>
        ${result}
      </li>
    `;
  },
};

function escape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
