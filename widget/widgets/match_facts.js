/* Match facts / Live commentary widget.
 *
 * Spec §3.4 XIII — single widget, two content modes:
 *   Pre-match: data-derived fact cards (match / team / player categories)
 *   In-play: scrolling text feed (vidi-printer style)
 *
 * Inner tabs let the user filter facts by category, and switch to
 * commentary when the match is live.
 */

const FACT_CATEGORY_LABELS = { match: "Match", team: "Team", player: "Player" };

export default {
  async mount(panelEl, ctx) {
    this.ctx = ctx;
    this.panelEl = panelEl;
    this.factCategory = "match";
    this.viewMode = "facts";  // "facts" | "commentary"
    this.commentaryLimit = ctx.options.commentary_limit || 25;
    await this._fetchAndRender();
  },

  async update(ctx) {
    this.ctx = ctx;
    await this._fetchAndRender();
  },

  async _fetchAndRender() {
    const phase = this.ctx.context.phase;
    if (phase === "live" && this.viewMode !== "commentary") {
      this.viewMode = "commentary"; // auto-switch into commentary mode at kick-off
    }
    if (phase === "pre" && this.viewMode === "commentary") {
      this.viewMode = "facts";
    }

    const matchId = this.ctx.context.match_id;
    this.panelEl.innerHTML = `<div class="sr-widget__loading">Loading…</div>`;

    try {
      if (this.viewMode === "facts") {
        const env = await this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/match-facts`);
        this._renderFacts(env.data, phase);
      } else {
        const env = await this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/commentary`, { limit: this.commentaryLimit });
        this._renderCommentary(env.data, phase);
      }
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load — ${escape(err.message)}</div>`;
    }
  },

  _renderFacts(data, phase) {
    const facts = this._factsFor(data, this.factCategory);
    const facts_html = facts.length
      ? facts.map((f) => `<li class="sr-facts__item">${escape(f)}</li>`).join("")
      : `<li class="sr-facts__empty">No facts available.</li>`;

    const inlineTabs = Object.entries(FACT_CATEGORY_LABELS).map(([id, label]) => `
      <button type="button" class="sr-pill ${id === this.factCategory ? "sr-pill--active" : ""}" data-cat="${id}">${label}</button>
    `).join("");

    const modeSwitch = phase === "live" ? `
      <button type="button" class="sr-pill" data-mode="commentary">Live commentary →</button>
    ` : "";

    this.panelEl.innerHTML = `
      <div class="sr-toolbar">
        <div class="sr-pill-group">${inlineTabs}</div>
        ${modeSwitch}
      </div>
      <ul class="sr-facts">${facts_html}</ul>
    `;

    this.panelEl.querySelectorAll(".sr-pill[data-cat]").forEach((b) => {
      b.addEventListener("click", () => { this.factCategory = b.dataset.cat; this._fetchAndRender(); });
    });
    const modeBtn = this.panelEl.querySelector('.sr-pill[data-mode="commentary"]');
    if (modeBtn) modeBtn.addEventListener("click", () => { this.viewMode = "commentary"; this._fetchAndRender(); });
  },

  _factsFor(data, category) {
    if (category === "match") return data.match || [];
    if (category === "team") {
      // Flatten all team facts.
      return Object.entries(data.team || {}).flatMap(([teamId, items]) =>
        items.map((it) => `[${teamId.toUpperCase()}] ${it}`)
      );
    }
    if (category === "player") {
      return Object.entries(data.player || {}).flatMap(([playerId, items]) =>
        items.map((it) => `${it}`)
      );
    }
    return [];
  },

  _renderCommentary(data, phase) {
    const items = (data.items || []).map((c) => `
      <li class="sr-feed__item sr-feed__item--${escape(c.type)}">
        <span class="sr-feed__minute">${c.minute}'</span>
        <span class="sr-feed__text">${escape(c.text)}</span>
      </li>
    `).join("");

    const switchBack = `<button type="button" class="sr-pill" data-mode="facts">← Match facts</button>`;
    const minuteBadge = data.minute_now ? `<span class="sr-feed__live">● ${data.minute_now}'</span>` : "";

    this.panelEl.innerHTML = `
      <div class="sr-toolbar">
        ${switchBack}
        ${minuteBadge}
      </div>
      <ul class="sr-feed">${items || `<li class="sr-feed__empty">No commentary yet.</li>`}</ul>
    `;

    const back = this.panelEl.querySelector('.sr-pill[data-mode="facts"]');
    if (back) back.addEventListener("click", () => { this.viewMode = "facts"; this._fetchAndRender(); });
  },
};

function escape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
