/* Tab navigation + panel container.
 *
 * Spec §2.3 — only one panel active at a time, switching swaps the
 * visible panel without full re-render. Panels are pre-rendered if
 * data was pre-fetched; otherwise the panel renders lazily on first
 * activation.
 */

export class TabContainer {
  constructor(rootEl, tabs, onActivate) {
    this.rootEl = rootEl;
    this.tabs = tabs; // [{ id, label, default }]
    this.onActivate = onActivate;
    this.activeId = null;
    this.panels = new Map();   // id -> panel element
    this._renderShell();
  }

  _renderShell() {
    const nav = document.createElement("nav");
    nav.className = "sr-tabs";
    nav.setAttribute("role", "tablist");

    for (const tab of this.tabs) {
      const btn = document.createElement("button");
      btn.className = "sr-tabs__btn";
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-tab-id", tab.id);
      btn.textContent = tab.label;
      btn.addEventListener("click", () => this.activate(tab.id));
      nav.appendChild(btn);
    }

    const panels = document.createElement("div");
    panels.className = "sr-panels";

    for (const tab of this.tabs) {
      const panel = document.createElement("section");
      panel.className = "sr-panel";
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("data-tab-id", tab.id);
      panel.innerHTML = `<div class="sr-widget__loading">Loading ${escape(tab.label)}…</div>`;
      panels.appendChild(panel);
      this.panels.set(tab.id, panel);
    }

    this.rootEl.appendChild(nav);
    this.rootEl.appendChild(panels);
    this.navEl = nav;

    // Detect tab-strip overflow so we can force an always-visible scrollbar.
    // CSS-only reliance on `-webkit-appearance: none` is no longer enough on
    // recent Chromium/Safari — the OS overlay-scrollbar setting wins. Toggling
    // overflow-x: scroll (via the .sr-tabs--scrollable class) reserves the
    // bar regardless. When tabs fit, we leave it on auto so no empty bar paints.
    this._checkOverflow();
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this._checkOverflow());
      this._resizeObserver.observe(this.navEl);
    }

    const initial = this.tabs.find((t) => t.default) || this.tabs[0];
    if (initial) this.activate(initial.id);
  }

  _checkOverflow() {
    if (!this.navEl) return;
    const overflowing = this.navEl.scrollWidth > this.navEl.clientWidth + 1;
    this.navEl.classList.toggle("sr-tabs--scrollable", overflowing);
  }

  activate(id) {
    if (this.activeId === id) return;
    this.activeId = id;

    for (const btn of this.navEl.querySelectorAll(".sr-tabs__btn")) {
      btn.classList.toggle("sr-tabs__btn--active", btn.dataset.tabId === id);
      btn.setAttribute("aria-selected", btn.dataset.tabId === id ? "true" : "false");
    }
    for (const [panelId, panel] of this.panels) {
      panel.classList.toggle("sr-panel--active", panelId === id);
    }

    if (this.onActivate) this.onActivate(id, this.panels.get(id));
  }

  panelFor(id) {
    return this.panels.get(id);
  }

  setVisibleTabs(visibleIds) {
    // Used by phase transitions — hide tabs whose phase doesn't match the
    // current match phase (e.g. xG race is hidden pre-match).
    for (const btn of this.navEl.querySelectorAll(".sr-tabs__btn")) {
      const visible = visibleIds.includes(btn.dataset.tabId);
      btn.style.display = visible ? "" : "none";
    }
    if (!visibleIds.includes(this.activeId) && visibleIds.length > 0) {
      this.activate(visibleIds[0]);
    }
  }
}

function escape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
