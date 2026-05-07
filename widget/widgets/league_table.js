/* League table widget.
 *
 * Tabular data with sortable columns and a position-change indicator
 * for in-play (spec §3.1). View toggles: overall / home / away.
 */

const VIEW_LABELS = { overall: "Overall", home: "Home", away: "Away" };

export default {
  async mount(panelEl, ctx) {
    this.ctx = ctx;
    this.panelEl = panelEl;
    this.view = ctx.options.default_view || "overall";
    this.limit = ctx.options.limit || null;
    await this._fetchAndRender();
  },

  async update(ctx) {
    this.ctx = ctx;
    await this._fetchAndRender();
  },

  async _fetchAndRender() {
    const competitionId = this.ctx.context.competition_id;
    if (!competitionId) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">No competition in context</div>`;
      return;
    }

    this.panelEl.innerHTML = `<div class="sr-widget__loading">Loading standings…</div>`;

    try {
      const params = { view: this.view };
      if (this.limit) params.limit = this.limit;
      const env = await this.ctx.api.get(`/competitions/${encodeURIComponent(competitionId)}/standings`, params);
      this._render(env.data);
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load standings — ${escape(err.message)}</div>`;
    }
  },

  _render(data) {
    const homeId = this.ctx.context.home?.team_id;
    const awayId = this.ctx.context.away?.team_id;
    const highlightSet = new Set([homeId, awayId].filter(Boolean));

    const rows = data.rows.map((row) => {
      const isHighlighted = highlightSet.has(row.team.team_id);
      const formCells = (row.form || []).map((r) => `<span class="sr-form sr-form--${r.toLowerCase()}">${escape(r)}</span>`).join("");
      // Position-change indicator (spec §3.1 I) — non-zero only when a related
      // match is live or finished, so it's invisible pre-match.
      const change = row.position_change || 0;
      const changeChip = change > 0
        ? `<span class="sr-pos-change sr-pos-change--up" title="Up ${change} since kick-off">↑${change}</span>`
        : change < 0
        ? `<span class="sr-pos-change sr-pos-change--down" title="Down ${-change} since kick-off">↓${-change}</span>`
        : "";
      return `
        <tr class="${isHighlighted ? "sr-table__row--highlight" : ""}">
          <td class="is-numeric"><span class="sr-pos">${row.position}</span>${changeChip}</td>
          <td>
            <span class="sr-team">
              <span class="sr-team__short">${escape(row.team.short_name)}</span>
              <span class="sr-team__name">${escape(row.team.name)}</span>
            </span>
          </td>
          <td class="is-numeric">${row.played}</td>
          <td class="is-numeric">${row.won}</td>
          <td class="is-numeric">${row.drawn}</td>
          <td class="is-numeric">${row.lost}</td>
          <td class="is-numeric">${row.goal_difference > 0 ? "+" : ""}${row.goal_difference}</td>
          <td class="is-numeric"><strong>${row.points}</strong></td>
          <td class="sr-form-cell">${formCells}</td>
        </tr>`;
    }).join("");

    const viewButtons = Object.entries(VIEW_LABELS).map(([id, label]) => `
      <button type="button" class="sr-pill ${id === this.view ? "sr-pill--active" : ""}" data-view="${id}">${label}</button>
    `).join("");

    this.panelEl.innerHTML = `
      <div class="sr-toolbar">
        <div class="sr-pill-group">${viewButtons}</div>
      </div>
      <div class="sr-table-scroll">
        <table class="sr-table sr-league-table">
          <thead>
            <tr>
              <th class="is-numeric">#</th>
              <th>Team</th>
              <th class="is-numeric">P</th>
              <th class="is-numeric">W</th>
              <th class="is-numeric">D</th>
              <th class="is-numeric">L</th>
              <th class="is-numeric">GD</th>
              <th class="is-numeric">Pts</th>
              <th>Form</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    this.panelEl.querySelectorAll(".sr-pill[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.view = btn.dataset.view;
        this._fetchAndRender();
      });
    });
  },
};

function escape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
