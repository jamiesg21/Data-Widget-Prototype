/* Head-to-head widget.
 *
 * Three sub-tabs (spec §3.2 IV):
 *   Team H2H stats     — aggregate W/D/L, distribution bar, goals/match
 *   Recent H2H results — match-by-match list (depth from options)
 *   Player vs player   — operator can enable/disable; lets the user pick
 *                        any two players from either squad
 */

// Stable display order for the player vs player comparison. Iterating in
// this order — rather than from the union of each player's stat keys —
// keeps row positions fixed when the user swaps players, even when the
// two players have different stat sets (e.g. GK vs forward).
const STAT_ORDER = [
  "appearances",
  "goals",
  "assists",
  "shots_per_90",
  "key_passes_per_90",
  "xg",
  "clean_sheets",
  "saves",
];

const STAT_LABELS = {
  appearances: "Appearances",
  goals: "Goals",
  assists: "Assists",
  shots_per_90: "Shots/90",
  key_passes_per_90: "Key passes/90",
  xg: "xG",
  clean_sheets: "Clean sheets",
  saves: "Saves",
};

export default {
  async mount(panelEl, ctx) {
    this.ctx = ctx;
    this.panelEl = panelEl;
    this.depth = ctx.options.depth || 5;
    this.allowPlayerSelector = ctx.options.player_selector !== false;
    this.mode = "team_stats";        // "team_stats" | "team_recent" | "players"
    this.playerA = null;             // chosen ids for player vs player
    this.playerB = null;
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
    this.panelEl.innerHTML = `<div class="sr-widget__loading">Loading head-to-head…</div>`;

    try {
      // Always fetch team H2H + lineups (lineups gives us squads for the player selector).
      const [h2h, lineups] = await Promise.all([
        this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/h2h`, { depth: this.depth }),
        this.allowPlayerSelector ? this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/lineups`) : Promise.resolve(null),
      ]);
      this._render(h2h.data, lineups?.data, matchId);
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load H2H — ${escape(err.message)}</div>`;
    }
  },

  _render(h2h, lineups, matchId) {
    const tabs = [
      { id: "team_stats",  label: "Team H2H stats" },
      { id: "team_recent", label: "Recent results" },
    ];
    if (this.allowPlayerSelector) tabs.push({ id: "players", label: "Player vs player" });

    const modeButtons = `
      <div class="sr-pill-group">
        ${tabs.map((t) => `<button type="button" class="sr-pill ${this.mode === t.id ? "sr-pill--active" : ""}" data-mode="${t.id}">${escape(t.label)}</button>`).join("")}
      </div>
    `;

    let body = "";
    if (this.mode === "team_stats")  body = this._teamStatsView(h2h);
    else if (this.mode === "team_recent") body = this._teamRecentView(h2h);
    else                                  body = this._playersView(lineups, matchId);

    this.panelEl.innerHTML = `<div class="sr-toolbar">${modeButtons}</div>${body}`;

    this.panelEl.querySelectorAll(".sr-pill[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.mode = btn.dataset.mode;
        this._fetchAndRender();
      });
    });
  },

  _teamStatsView(h2h) {
    const s = h2h.summary;
    const total = s.home_wins + s.away_wins + s.draws || 1;
    const homePct = (s.home_wins / total) * 100;
    const drawPct = (s.draws / total) * 100;
    const awayPct = (s.away_wins / total) * 100;
    const homeId = this.ctx.context.home.short_name;
    const awayId = this.ctx.context.away.short_name;

    return `
      <div class="sr-h2h__summary">
        <div class="sr-h2h__count"><strong>${s.home_wins}</strong><span>${escape(homeId)} wins</span></div>
        <div class="sr-h2h__count"><strong>${s.draws}</strong><span>Draws</span></div>
        <div class="sr-h2h__count"><strong>${s.away_wins}</strong><span>${escape(awayId)} wins</span></div>
      </div>
      <div class="sr-h2h__bar">
        <div class="sr-h2h__bar-home" style="width:${homePct}%"></div>
        <div class="sr-h2h__bar-draw" style="width:${drawPct}%"></div>
        <div class="sr-h2h__bar-away" style="width:${awayPct}%"></div>
      </div>
      <div class="sr-h2h__meta">${s.home_goals}-${s.away_goals} aggregate · ${s.avg_goals_per_game.toFixed(1)} goals/match</div>
    `;
  },

  _teamRecentView(h2h) {
    const recent = h2h.recent.map((m) => {
      const d = new Date(m.kickoff_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      return `<li class="sr-h2h__match">
        <span class="sr-h2h__date">${d}</span>
        <span class="sr-h2h__teams">${escape(m.home.team_id.toUpperCase())} <strong>${m.home.score}-${m.away.score}</strong> ${escape(m.away.team_id.toUpperCase())}</span>
      </li>`;
    }).join("");
    return recent
      ? `<ul class="sr-h2h__matches">${recent}</ul>`
      : `<div class="sr-widget__empty">No recent meetings recorded.</div>`;
  },

  _playersView(lineups, matchId) {
    if (!lineups) return `<div class="sr-widget__loading">Loading squads…</div>`;
    const homeSquad = lineups.home.squad || [];
    const awaySquad = lineups.away.squad || [];

    if (!this.playerA) this.playerA = homeSquad.find((p) => p.position_group === "FWD")?.player_id || homeSquad[0]?.player_id;
    if (!this.playerB) this.playerB = awaySquad.find((p) => p.position_group === "FWD")?.player_id || awaySquad[0]?.player_id;

    const optionsHtml = (squad, selected) => squad.map((p) =>
      `<option value="${escape(p.player_id)}" ${p.player_id === selected ? "selected" : ""}>${escape(p.name)} (#${p.shirt})</option>`
    ).join("");

    setTimeout(() => this._loadPlayerComparison(matchId), 0);

    return `
      <div class="sr-pvp__selectors">
        <select class="sr-pvp__select" data-side="a">${optionsHtml(homeSquad, this.playerA)}</select>
        <span class="sr-pvp__vs">vs</span>
        <select class="sr-pvp__select" data-side="b">${optionsHtml(awaySquad, this.playerB)}</select>
      </div>
      <div class="sr-pvp__compare" data-pvp-target><div class="sr-widget__loading">Loading comparison…</div></div>
    `;
  },

  async _loadPlayerComparison(matchId) {
    this.panelEl.querySelectorAll(".sr-pvp__select").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        if (e.target.dataset.side === "a") this.playerA = e.target.value;
        if (e.target.dataset.side === "b") this.playerB = e.target.value;
        this._loadPlayerComparison(matchId);
      });
    });

    const target = this.panelEl.querySelector("[data-pvp-target]");
    if (!target) return;

    try {
      const env = await this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/h2h/players`, {
        a: this.playerA,
        b: this.playerB,
      });
      const { a, b } = env.data;
      // Always render every row from STAT_ORDER — no rows added or removed
      // when the user swaps players. Cells without a value display as "—".
      // This keeps the table anchored in a fixed shape regardless of which
      // positions the two selected players play.
      const rows = STAT_ORDER.map((k) => {
        const av = a.stats[k];
        const bv = b.stats[k];
        const bothNumeric = av !== undefined && bv !== undefined && !isNaN(Number(av)) && !isNaN(Number(bv));
        const aw = bothNumeric && Number(av) > Number(bv);
        const bw = bothNumeric && Number(bv) > Number(av);
        return `
          <tr>
            <td class="sr-pvp__a ${aw ? "is-better" : ""}">${formatNum(av)}</td>
            <td class="sr-pvp__label">${escape(STAT_LABELS[k] || k)}</td>
            <td class="sr-pvp__b ${bw ? "is-better" : ""}">${formatNum(bv)}</td>
          </tr>
        `;
      }).join("");
      target.innerHTML = `
        <table class="sr-pvp__table">
          <colgroup>
            <col class="sr-pvp__col-side">
            <col class="sr-pvp__col-label">
            <col class="sr-pvp__col-side">
          </colgroup>
          <thead><tr><th>${escape(a.name)}</th><th></th><th>${escape(b.name)}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    } catch (err) {
      target.innerHTML = `<div class="sr-widget__error">Failed to load player comparison — ${escape(err.message)}</div>`;
    }
  },
};

function formatNum(n) {
  if (n === undefined || n === null) return "—";
  if (Number.isInteger(Number(n))) return String(n);
  return Number(n).toFixed(2);
}

function escape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
