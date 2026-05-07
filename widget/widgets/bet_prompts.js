/* Bet prompts widget.
 *
 * Spec §4 — both phases.
 * PRE: card list of data-driven prompts with a confidence percentage.
 * LIVE: event-triggered prompts updated in real time.
 * Sub-tabs: Pre-match / In-play (the In-play tab is hidden when phase === "pre").
 *
 * API: GET /matches/{match_id}/bet-prompts
 */

export default {
  async mount(panelEl, ctx) {
    this.ctx = ctx;
    this.panelEl = panelEl;
    this.view = ctx.context.phase === "live" ? "live" : "pre";
    await this._fetchAndRender();
  },

  async update(ctx) {
    this.ctx = ctx;
    // If phase just flipped to live, auto-switch view.
    if (ctx.context.phase === "live" && this.view === "pre") {
      this.view = "live";
    }
    await this._fetchAndRender();
  },

  async _fetchAndRender() {
    const matchId = this.ctx.context.match_id;
    const phase = this.ctx.context.phase;
    const maxPrompts = this.ctx.options.max_prompts || 5;
    this.panelEl.innerHTML = `<div class="sr-widget__loading">Loading…</div>`;

    try {
      const env = await this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/bet-prompts`);
      this._render(env.data, phase, maxPrompts);
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load — ${escape(err.message)}</div>`;
    }
  },

  _render(data, phase, maxPrompts) {
    const isLive = phase === "live";
    const view = this.view;

    // Sub-tabs: always show Pre-match; In-play only when live
    const tabs = `
      <div class="sr-toolbar">
        <div class="sr-pill-group">
          <button type="button" class="sr-pill ${view === "pre" ? "sr-pill--active" : ""}" data-view="pre">Pre-match</button>
          ${isLive ? `<button type="button" class="sr-pill ${view === "live" ? "sr-pill--active" : ""}" data-view="live">In-play</button>` : ""}
        </div>
      </div>
    `;

    const prompts = view === "live" ? (data.live || []) : (data.pre || []);
    const capped = prompts.slice(0, maxPrompts);

    const cards = capped.length ? capped.map((p) => {
      const confPct = Math.round((p.confidence || 0) * 100);
      const confClass = confPct >= 80 ? "high" : confPct >= 65 ? "mid" : "low";
      const eventBadge = p.event ? `<span class="sr-prompts__event">${escape(p.event.replace("_", " "))}</span>` : "";
      return `
        <li class="sr-prompts__card">
          <p class="sr-prompts__text">${escape(p.text)}</p>
          <div class="sr-prompts__meta">
            ${eventBadge}
            <span class="sr-prompts__conf sr-prompts__conf--${confClass}">
              ${confPct}% confidence
            </span>
          </div>
        </li>
      `;
    }).join("") : `<li class="sr-prompts__empty">No prompts available.</li>`;

    this.panelEl.innerHTML = `
      <div class="sr-prompts">
        ${tabs}
        <ul class="sr-prompts__list">${cards}</ul>
      </div>
    `;

    this.panelEl.querySelectorAll(".sr-pill[data-view]").forEach((b) => {
      b.addEventListener("click", () => {
        this.view = b.dataset.view;
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
