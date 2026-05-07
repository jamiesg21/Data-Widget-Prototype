/* Attacking thirds widget.
 *
 * Spec §4 — available both pre-match (last 5 games) and live (current match).
 * Shows the percentage of attacks through Left / Centre / Right channels for
 * each team, rendered as three labelled progress bars.
 *
 * API: GET /matches/{match_id}/attacking-thirds
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
    const matchId = this.ctx.context.match_id;
    const phase = this.ctx.context.phase;
    this.panelEl.innerHTML = `<div class="sr-widget__loading">Loading…</div>`;

    try {
      const env = await this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/attacking-thirds`);
      this._render(env.data, phase);
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load — ${escape(err.message)}</div>`;
    }
  },

  _render(data, phase) {
    const label = phase === "live" ? "Current match" : "Last 5 games";
    const homeId = this.ctx.context.home?.team_id || "Home";
    const awayId = this.ctx.context.away?.team_id || "Away";
    const homeName = this.ctx.context.home?.short_name || homeId;
    const awayName = this.ctx.context.away?.short_name || awayId;

    const teamBlock = (name, channels) => `
      <div class="sr-thirds__team">
        <h4 class="sr-thirds__team-name">${escape(name)}</h4>
        ${["left", "centre", "right"].map((ch) => `
          <div class="sr-thirds__channel">
            <span class="sr-thirds__ch-label">${ch.charAt(0).toUpperCase() + ch.slice(1)}</span>
            <div class="sr-thirds__bar-wrap">
              <div class="sr-thirds__bar sr-thirds__bar--${ch}" style="width:${channels[ch] || 0}%"></div>
            </div>
            <span class="sr-thirds__pct">${channels[ch] || 0}%</span>
          </div>
        `).join("")}
      </div>
    `;

    this.panelEl.innerHTML = `
      <div class="sr-thirds">
        <p class="sr-thirds__label">${escape(label)}</p>
        <div class="sr-thirds__teams">
          ${teamBlock(homeName, data.home || {})}
          ${teamBlock(awayName, data.away || {})}
        </div>
      </div>
    `;
  },
};

function escape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
