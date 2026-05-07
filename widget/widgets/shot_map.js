/* Shot map widget.
 *
 * Spec §4 — PRE: last 5 games shots with a game-range selector.
 *            LIVE: every shot from the current match plotted in real time.
 *
 * Shots are rendered as SVG circles on a simplified pitch rectangle:
 *   - Goal: filled circle, accent colour
 *   - On target: filled circle, team colour
 *   - Off target: hollow circle (stroke only), team colour
 *
 * API: GET /matches/{match_id}/shot-map
 */

const PITCH_W = 400;
const PITCH_H = 260;

export default {
  async mount(panelEl, ctx) {
    this.ctx = ctx;
    this.panelEl = panelEl;
    this.gameRange = "last5"; // only relevant pre-match
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
      const env = await this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/shot-map`);
      this._render(env.data, phase);
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load — ${escape(err.message)}</div>`;
    }
  },

  _render(data, phase) {
    const shots = data.shots || [];
    const isLive = phase === "live";

    // Toolbar: game range selector only pre-match
    const toolbar = !isLive ? `
      <div class="sr-toolbar">
        <div class="sr-pill-group">
          ${["last5", "last10"].map((r) => `
            <button type="button" class="sr-pill ${r === this.gameRange ? "sr-pill--active" : ""}" data-range="${r}">
              ${r === "last5" ? "Last 5" : "Last 10"}
            </button>
          `).join("")}
        </div>
      </div>
    ` : `<div class="sr-toolbar"><span class="sr-feed__live">● Live shots</span></div>`;

    const circles = shots.map((s) => {
      const cx = Math.round(s.x * PITCH_W);
      const cy = Math.round(s.y * PITCH_H);
      const isHome = s.team === "home";
      const fill = s.goal ? "#f59e0b" : (s.on_target ? (isHome ? "#3b82f6" : "#ef4444") : "none");
      const stroke = isHome ? "#3b82f6" : "#ef4444";
      const r = s.goal ? 7 : 5;
      const title = `xG: ${s.xg}${s.goal ? " ⚽" : ""}`;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" opacity="0.85"><title>${escape(title)}</title></circle>`;
    }).join("");

    // Simplified pitch: rectangle with centre line, penalty areas
    const pitchSvg = `
      <svg class="sr-shotmap__pitch" viewBox="0 0 ${PITCH_W} ${PITCH_H}" xmlns="http://www.w3.org/2000/svg">
        <!-- Pitch outline -->
        <rect x="1" y="1" width="${PITCH_W - 2}" height="${PITCH_H - 2}" fill="#1a472a" stroke="#fff" stroke-width="1.5"/>
        <!-- Centre line -->
        <line x1="${PITCH_W / 2}" y1="1" x2="${PITCH_W / 2}" y2="${PITCH_H - 1}" stroke="#fff" stroke-width="1" opacity="0.4"/>
        <!-- Left penalty area -->
        <rect x="1" y="${PITCH_H * 0.2}" width="${PITCH_W * 0.17}" height="${PITCH_H * 0.6}" fill="none" stroke="#fff" stroke-width="1" opacity="0.4"/>
        <!-- Right penalty area -->
        <rect x="${PITCH_W - PITCH_W * 0.17}" y="${PITCH_H * 0.2}" width="${PITCH_W * 0.17}" height="${PITCH_H * 0.6}" fill="none" stroke="#fff" stroke-width="1" opacity="0.4"/>
        ${circles}
      </svg>
    `;

    // Legend
    const legend = `
      <div class="sr-shotmap__legend">
        <span class="sr-shotmap__key sr-shotmap__key--goal">Goal</span>
        <span class="sr-shotmap__key sr-shotmap__key--on">On target</span>
        <span class="sr-shotmap__key sr-shotmap__key--off">Off target</span>
        <span class="sr-shotmap__key sr-shotmap__key--home">Home</span>
        <span class="sr-shotmap__key sr-shotmap__key--away">Away</span>
      </div>
    `;

    this.panelEl.innerHTML = `
      <div class="sr-shotmap">
        ${toolbar}
        ${pitchSvg}
        ${legend}
      </div>
    `;

    // Range selector events (pre-match only)
    this.panelEl.querySelectorAll(".sr-pill[data-range]").forEach((b) => {
      b.addEventListener("click", () => {
        this.gameRange = b.dataset.range;
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
