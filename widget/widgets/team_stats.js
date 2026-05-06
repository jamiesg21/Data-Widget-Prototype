/* Team stats widget.
 *
 * Pre-match: season / last5 / last10 / home_away with a comparison
 * bar per stat. In-play: live match stats tab activates.
 */

const RECENCY_LABELS = {
  season: "Season",
  last5: "Last 5",
  last10: "Last 10",
  home_away: "Home/Away",
  live: "Live",
};

const STAT_LABELS = {
  goals_per_game: "Goals/game",
  shots_per_game: "Shots/game",
  shots_on_target_per_game: "SOT/game",
  possession_pct: "Possession %",
  xg_per_game: "xG/game",
  xga_per_game: "xGA/game",
  clean_sheets: "Clean sheets",
  goals_conceded_per_game: "Goals conceded/game",
  corners_per_game: "Corners/game",
  fouls_per_game: "Fouls/game",
  shots: "Shots",
  shots_on_target: "Shots on target",
  corners: "Corners",
  fouls: "Fouls",
  yellow_cards: "Yellow cards",
  red_cards: "Red cards",
  passes: "Passes",
  pass_accuracy_pct: "Pass accuracy %",
};

// Stats where lower is better (defender's eye view).
const LOWER_IS_BETTER = new Set(["xga_per_game", "goals_conceded_per_game", "fouls_per_game", "fouls", "yellow_cards", "red_cards"]);

export default {
  async mount(panelEl, ctx) {
    this.ctx = ctx;
    this.panelEl = panelEl;
    this.recency = ctx.options.default_recency || "season";
    this.categories = ctx.options.categories || "all";
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
    const phase = this.ctx.context.phase;
    if (this.recency === "live" && phase !== "live") this.recency = "season"; // can't show live tab pre-match

    this.panelEl.innerHTML = `<div class="sr-widget__loading">Loading team stats…</div>`;

    try {
      const env = await this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/team-stats`, {
        recency: this.recency,
        categories: this.categories,
      });
      this._render(env.data, phase);
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load team stats — ${escape(err.message)}</div>`;
    }
  },

  _render(data, phase) {
    const recencyOptions = { season: "Season", last5: "Last 5", last10: "Last 10", home_away: "Home/Away" };
    if (phase === "live") recencyOptions.live = "Live";

    const recencyButtons = Object.entries(recencyOptions).map(([id, label]) => `
      <button type="button" class="sr-pill ${id === this.recency ? "sr-pill--active" : ""}" data-recency="${id}">${label}</button>
    `).join("");

    const home = data.home.stats;
    const away = data.away.stats;
    const keys = Object.keys({ ...home, ...away });

    const rows = keys.map((k) => this._statRow(k, home[k], away[k], data.home.team_id, data.away.team_id)).join("");

    const liveMinute = data.minute ? `<div class="sr-stats__live-minute">${data.minute}'</div>` : "";

    this.panelEl.innerHTML = `
      <div class="sr-toolbar">
        <div class="sr-pill-group">${recencyButtons}</div>
        ${liveMinute}
      </div>
      <table class="sr-stats">
        <thead>
          <tr>
            <th class="sr-stats__home-head">${escape(data.home.team_id.toUpperCase())}</th>
            <th class="sr-stats__label-head">Stat</th>
            <th class="sr-stats__away-head">${escape(data.away.team_id.toUpperCase())}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    this.panelEl.querySelectorAll(".sr-pill[data-recency]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.recency = btn.dataset.recency;
        this._fetchAndRender();
      });
    });
  },

  _statRow(key, homeVal, awayVal, homeId, awayId) {
    if (homeVal === undefined || awayVal === undefined) return "";
    const label = STAT_LABELS[key] || key;
    const homeNum = Number(homeVal);
    const awayNum = Number(awayVal);
    const total = homeNum + awayNum;
    const homePct = total > 0 ? (homeNum / total) * 100 : 50;
    const awayPct = 100 - homePct;
    const lowerBetter = LOWER_IS_BETTER.has(key);
    const homeWins = lowerBetter ? homeNum < awayNum : homeNum > awayNum;
    const awayWins = lowerBetter ? awayNum < homeNum : awayNum > homeNum;

    return `
      <tr>
        <td class="sr-stats__home ${homeWins ? "is-better" : ""}">${formatNum(homeNum)}</td>
        <td class="sr-stats__label">
          <div class="sr-stats__label-text">${escape(label)}</div>
          <div class="sr-stats__bar">
            <div class="sr-stats__bar-home" style="width: ${homePct.toFixed(1)}%"></div>
            <div class="sr-stats__bar-away" style="width: ${awayPct.toFixed(1)}%"></div>
          </div>
        </td>
        <td class="sr-stats__away ${awayWins ? "is-better" : ""}">${formatNum(awayNum)}</td>
      </tr>
    `;
  },
};

function formatNum(n) {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function escape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
