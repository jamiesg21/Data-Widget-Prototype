/* Pass networks widget.
 *
 * Spec §4 — PRE only (tab is hidden when phase === "live").
 * Shows the top passing pairs as a ranked list for each team.
 * e.g. "Salah → Núñez: 14 passes"
 *
 * API: GET /matches/{match_id}/pass-networks
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
      const env = await this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/pass-networks`);
      this._render(env.data);
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load — ${escape(err.message)}</div>`;
    }
  },

  _render(data) {
    const homeName = this.ctx.context.home?.short_name || "Home";
    const awayName = this.ctx.context.away?.short_name || "Away";

    const pairList = (pairs, label) => {
      if (!pairs || pairs.length === 0) {
        return `<div class="sr-pass__team"><h4>${escape(label)}</h4><p class="sr-pass__empty">No data.</p></div>`;
      }
      const items = pairs.map((p, i) => `
        <li class="sr-pass__pair">
          <span class="sr-pass__rank">${i + 1}</span>
          <span class="sr-pass__names">${escape(p.from)} → ${escape(p.to)}</span>
          <span class="sr-pass__count">${p.count} passes</span>
        </li>
      `).join("");
      return `
        <div class="sr-pass__team">
          <h4 class="sr-pass__team-name">${escape(label)}</h4>
          <ol class="sr-pass__list">${items}</ol>
        </div>
      `;
    };

    this.panelEl.innerHTML = `
      <div class="sr-pass">
        <p class="sr-pass__label">Top passing combinations — historical data</p>
        <div class="sr-pass__teams">
          ${pairList(data.home, homeName)}
          ${pairList(data.away, awayName)}
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
