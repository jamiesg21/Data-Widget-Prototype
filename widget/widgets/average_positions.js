/* Average positions widget.
 *
 * Spec §4 — PRE only (tab is hidden when phase === "live").
 * Shows player initials plotted at their average x/y positions on a simple
 * SVG pitch.  Two sub-tabs: In possession / Out of possession.
 *
 * API: GET /matches/{match_id}/average-positions
 */

const PITCH_W = 400;
const PITCH_H = 260;

export default {
  async mount(panelEl, ctx) {
    this.ctx = ctx;
    this.panelEl = panelEl;
    this.possession = "in_possession"; // "in_possession" | "out_of_possession"
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
      const env = await this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/average-positions`);
      this._render(env.data);
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load — ${escape(err.message)}</div>`;
    }
  },

  _render(data) {
    const homeName = this.ctx.context.home?.short_name || "Home";
    const awayName = this.ctx.context.away?.short_name || "Away";
    const mode = this.possession;

    const toolbar = `
      <div class="sr-toolbar">
        <div class="sr-pill-group">
          <button type="button" class="sr-pill ${mode === "in_possession" ? "sr-pill--active" : ""}" data-pos="in_possession">In possession</button>
          <button type="button" class="sr-pill ${mode === "out_of_possession" ? "sr-pill--active" : ""}" data-pos="out_of_possession">Out of possession</button>
        </div>
      </div>
    `;

    const homePlayers = (data.home || {})[mode] || [];
    const awayPlayers = (data.away || {})[mode] || [];

    const initials = (name) => name.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase();

    const dots = (players, isHome) => players.map((p) => {
      const cx = Math.round(p.x * PITCH_W);
      const cy = Math.round(p.y * PITCH_H);
      const fill = isHome ? "#3b82f6" : "#ef4444";
      return `
        <g transform="translate(${cx},${cy})">
          <circle r="14" fill="${fill}" opacity="0.85"/>
          <text text-anchor="middle" dy="4" fill="#fff" font-size="9" font-family="system-ui,sans-serif">${escape(initials(p.name))}</text>
          <title>${escape(p.name)}</title>
        </g>
      `;
    }).join("");

    const pitchSvg = `
      <svg class="sr-avgpos__pitch" viewBox="0 0 ${PITCH_W} ${PITCH_H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="${PITCH_W - 2}" height="${PITCH_H - 2}" fill="#1a472a" stroke="#fff" stroke-width="1.5"/>
        <line x1="${PITCH_W / 2}" y1="1" x2="${PITCH_W / 2}" y2="${PITCH_H - 1}" stroke="#fff" stroke-width="1" opacity="0.4"/>
        <rect x="1" y="${PITCH_H * 0.2}" width="${PITCH_W * 0.17}" height="${PITCH_H * 0.6}" fill="none" stroke="#fff" stroke-width="1" opacity="0.4"/>
        <rect x="${PITCH_W - PITCH_W * 0.17}" y="${PITCH_H * 0.2}" width="${PITCH_W * 0.17}" height="${PITCH_H * 0.6}" fill="none" stroke="#fff" stroke-width="1" opacity="0.4"/>
        ${dots(homePlayers, true)}
        ${dots(awayPlayers, false)}
      </svg>
    `;

    const legend = `
      <div class="sr-avgpos__legend">
        <span class="sr-avgpos__key sr-avgpos__key--home">${escape(homeName)}</span>
        <span class="sr-avgpos__key sr-avgpos__key--away">${escape(awayName)}</span>
      </div>
    `;

    this.panelEl.innerHTML = `
      <div class="sr-avgpos">
        ${toolbar}
        ${pitchSvg}
        ${legend}
      </div>
    `;

    this.panelEl.querySelectorAll(".sr-pill[data-pos]").forEach((b) => {
      b.addEventListener("click", () => {
        this.possession = b.dataset.pos;
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
