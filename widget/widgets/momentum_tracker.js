/* Momentum tracker widget.
 *
 * Spec §4 — LIVE only (tab is hidden pre-match).
 * Shows rolling 5-minute dominance windows as a dual-colour horizontal bar
 * for each period.  Home share fills left-to-right in the team's colour,
 * away share fills right-to-left.
 *
 * API: GET /matches/{match_id}/momentum
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
    this.panelEl.innerHTML = `<div class="sr-widget__loading">Loading…</div>`;

    try {
      const env = await this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/momentum`);
      this._render(env.data);
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load — ${escape(err.message)}</div>`;
    }
  },

  _render(data) {
    const homeName = this.ctx.context.home?.short_name || "Home";
    const awayName = this.ctx.context.away?.short_name || "Away";
    const periods = data.periods || [];

    if (periods.length === 0) {
      this.panelEl.innerHTML = `<p class="sr-momentum__empty">No momentum data yet.</p>`;
      return;
    }

    const rows = periods.map((p) => {
      const homePct = Math.round((p.home || 0) * 100);
      const awayPct = 100 - homePct;
      return `
        <div class="sr-momentum__row">
          <span class="sr-momentum__minute">${p.minute}'</span>
          <div class="sr-momentum__bar-wrap">
            <div class="sr-momentum__bar-home" style="width:${homePct}%">
              ${homePct > 15 ? `<span class="sr-momentum__pct">${homePct}%</span>` : ""}
            </div>
            <div class="sr-momentum__bar-away" style="width:${awayPct}%">
              ${awayPct > 15 ? `<span class="sr-momentum__pct">${awayPct}%</span>` : ""}
            </div>
          </div>
        </div>
      `;
    }).join("");

    this.panelEl.innerHTML = `
      <div class="sr-momentum">
        <div class="sr-momentum__legend">
          <span class="sr-momentum__key sr-momentum__key--home">${escape(homeName)}</span>
          <span class="sr-momentum__key sr-momentum__key--away">${escape(awayName)}</span>
        </div>
        <div class="sr-momentum__rows">${rows}</div>
      </div>
    `;
  },
};

function escape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
