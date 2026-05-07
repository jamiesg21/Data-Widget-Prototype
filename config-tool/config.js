/* Theming tool — controller.
 *
 * State model:
 *   {
 *     theme:  'light' | 'dark',
 *     shared: { typography + spacing — applied in BOTH modes },
 *     light:  { colour palette },
 *     dark:   { colour palette },
 *     pages:  { match: { tabs: { [id]: { enabled, default } }, options: { [id]: { ... } } }, competition: {...}, homepage: {...} }
 *   }
 *
 * Layout knobs (font, size, spacing, radius) are theme-agnostic — operators
 * expect their typography and rhythm to stay constant when end-users flip
 * dark mode. Only the colour palette has a per-theme override.
 *
 * The preview uses the exact same mechanism the operator will: an inline
 * <style> block targeting `.sr-widget` and `.sr-widget[data-theme="dark"]`.
 * What you see in the preview is exactly what you'll ship.
 */

const STORAGE_KEY = "sr-config-tool-v2";  // bumped from v1 — schema change

// ---- Widget availability catalogue (§5) ----
// pageTypes lists which page contexts each widget may appear on.
// Used to filter the widget toggle list when the operator selects a page type.

const WIDGETS = [
  { id: "league_table",      label: "League Table",             pageTypes: ["competition", "match", "homepage"] },
  { id: "fixtures",          label: "Fixtures / Results",       pageTypes: ["competition", "match", "homepage"] },
  { id: "lineups",           label: "Squad List / Line-ups",    pageTypes: ["match"] },
  { id: "h2h",               label: "Head-to-Head",             pageTypes: ["match"] },
  { id: "team_stats",        label: "Team Stats",               pageTypes: ["match"] },
  { id: "attacking_thirds",  label: "Attacking Thirds",         pageTypes: ["match"] },
  { id: "xg_timeline",       label: "xG Race Graph",            pageTypes: ["match"] },
  { id: "shot_map",          label: "Shot Map",                 pageTypes: ["match"] },
  { id: "pass_networks",     label: "Pass Networks",            pageTypes: ["match"] },
  { id: "momentum_tracker",  label: "Momentum Tracker",         pageTypes: ["match"] },
  { id: "average_positions", label: "Average Positions",        pageTypes: ["match"] },
  { id: "bet_prompts",       label: "Bet Prompts",              pageTypes: ["competition", "match", "homepage"] },
  { id: "match_facts",       label: "Match Facts / Commentary", pageTypes: ["match", "homepage"] },
];

// scope: "shared" — applies to both themes (written to state.shared).
// scope: "theme"  — different per theme (written to state.light / state.dark).
const VARIABLES = [
  { section: "Brand colours", scope: "theme",  id: "--sr-color-primary",     label: "Primary",       type: "color" },
  { section: "Brand colours", scope: "theme",  id: "--sr-color-secondary",   label: "Secondary",     type: "color" },
  { section: "Brand colours", scope: "theme",  id: "--sr-color-bg",          label: "Background",    type: "color" },
  { section: "Brand colours", scope: "theme",  id: "--sr-color-surface",     label: "Surface",       type: "color", hint: "Panel highlights, inactive pills" },
  { section: "Brand colours", scope: "theme",  id: "--sr-color-text",        label: "Text",          type: "color" },
  { section: "Brand colours", scope: "theme",  id: "--sr-color-text-muted",  label: "Muted text",    type: "color" },
  { section: "Brand colours", scope: "theme",  id: "--sr-color-border",      label: "Border",        type: "color" },
  { section: "Brand colours", scope: "theme",  id: "--sr-color-positive",    label: "Positive",      type: "color", hint: "W chips, advantage highlight" },
  { section: "Brand colours", scope: "theme",  id: "--sr-color-negative",    label: "Negative",      type: "color", hint: "L chips, live indicator" },

  { section: "Typography",    scope: "shared", id: "--sr-font-family",       label: "Font family",   type: "select", options: [
      { value: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",  label: "Inter (default)" },
      { value: "'Roboto', sans-serif", label: "Roboto" },
      { value: "'Helvetica Neue', Helvetica, Arial, sans-serif", label: "Helvetica Neue" },
      { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
      { value: "'Playfair Display', Georgia, serif", label: "Playfair Display" },
      { value: "'Courier New', monospace", label: "Courier New" },
      { value: "system-ui, sans-serif", label: "System default" },
  ]},
  { section: "Typography",    scope: "shared", id: "--sr-font-size-base",    label: "Base size",     type: "range", min: 12, max: 18, step: 1, unit: "px" },

  { section: "Spacing & shape", scope: "shared", id: "--sr-spacing-unit",    label: "Spacing unit",  type: "range", min: 4,  max: 16, step: 1, unit: "px" },
  { section: "Spacing & shape", scope: "shared", id: "--sr-border-radius",   label: "Border radius", type: "range", min: 0,  max: 24, step: 1, unit: "px" },
];

const DEFAULT_SHARED = {
  "--sr-font-family":    "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  "--sr-font-size-base": "14px",
  "--sr-spacing-unit":   "8px",
  "--sr-border-radius":  "6px",
};

const DEFAULT_LIGHT = {
  "--sr-color-primary":    "#2d5c2e",
  "--sr-color-secondary":  "#f5a623",
  "--sr-color-bg":         "#ffffff",
  "--sr-color-surface":    "#f7f7f8",
  "--sr-color-text":       "#1a1a1a",
  "--sr-color-text-muted": "#6b7280",
  "--sr-color-border":     "#e3e5e8",
  "--sr-color-positive":   "#2d8a3e",
  "--sr-color-negative":   "#c0392b",
};

const DEFAULT_DARK = {
  "--sr-color-primary":    "#5cab5d",
  "--sr-color-secondary":  "#f5a623",
  "--sr-color-bg":         "#0f1419",
  "--sr-color-surface":    "#1a1f24",
  "--sr-color-text":       "#e6e8eb",
  "--sr-color-text-muted": "#94a3b8",
  "--sr-color-border":     "#2a2f36",
  "--sr-color-positive":   "#4ade80",
  "--sr-color-negative":   "#f87171",
};

// ---------------------------------------------------------------------------
// §6 — Per-Page-Type Configuration
// ---------------------------------------------------------------------------

// L2: Phase tags for each tab.
// PRE  = only shown before kick-off
// LIVE = only shown after kick-off
// BOTH (default) = always visible
const TAB_PHASES = {
  // PRE only
  fixtures:         "pre",
  h2h:              "pre",
  pass_networks:    "pre",
  average_positions:"pre",
  // LIVE only
  xg_timeline:      "live",
  momentum_tracker: "live",
  // All others → "both" (computed in phaseBadge)
};

function phaseBadge(tabId) {
  const p = TAB_PHASES[tabId] || "both";
  return `<span class="ct-phase-badge ct-phase-badge--${p}">${p.toUpperCase()}</span>`;
}

// All available widget tabs, keyed by page type.
// Each entry: { id, label, defaultEnabled, defaultDefault }
const PAGE_TABS = {
  match: [
    { id: "league_table",      label: "Standings",        defaultEnabled: true,  defaultDefault: true  },
    { id: "fixtures",          label: "Form / Fixtures",  defaultEnabled: true,  defaultDefault: false },
    { id: "lineups",           label: "Line-ups",         defaultEnabled: true,  defaultDefault: false },
    { id: "team_stats",        label: "Team stats",       defaultEnabled: true,  defaultDefault: false },
    { id: "h2h",               label: "Head to head",     defaultEnabled: true,  defaultDefault: false },
    { id: "xg_timeline",       label: "xG race",          defaultEnabled: false, defaultDefault: false },
    { id: "momentum_tracker",  label: "Momentum tracker", defaultEnabled: false, defaultDefault: false },
    { id: "shot_map",          label: "Shot map",         defaultEnabled: false, defaultDefault: false },
    { id: "attacking_thirds",  label: "Attacking thirds", defaultEnabled: false, defaultDefault: false },
    { id: "pass_networks",     label: "Pass networks",    defaultEnabled: false, defaultDefault: false },
    { id: "average_positions", label: "Avg positions",    defaultEnabled: false, defaultDefault: false },
    { id: "match_facts",       label: "Match facts",      defaultEnabled: true,  defaultDefault: false },
    { id: "bet_prompts",       label: "Bet prompts",      defaultEnabled: false, defaultDefault: false },
  ],
  competition: [
    { id: "league_table",      label: "Standings",        defaultEnabled: true,  defaultDefault: true  },
    { id: "fixtures",          label: "Fixtures",         defaultEnabled: true,  defaultDefault: false },
    { id: "team_stats",        label: "Team stats",       defaultEnabled: true,  defaultDefault: false },
    { id: "shot_map",          label: "Shot map",         defaultEnabled: false, defaultDefault: false },
    { id: "attacking_thirds",  label: "Attacking thirds", defaultEnabled: false, defaultDefault: false },
    { id: "match_facts",       label: "Latest news",      defaultEnabled: true,  defaultDefault: false },
    { id: "bet_prompts",       label: "Bet prompts",      defaultEnabled: false, defaultDefault: false },
  ],
  homepage: [
    { id: "league_table",      label: "Standings",        defaultEnabled: true,  defaultDefault: true  },
    { id: "fixtures",          label: "Fixtures",         defaultEnabled: true,  defaultDefault: false },
    { id: "match_facts",       label: "Latest news",      defaultEnabled: true,  defaultDefault: false },
    { id: "bet_prompts",       label: "Bet prompts",      defaultEnabled: false, defaultDefault: false },
  ],
};

// L3: Behaviour/display options per widget.
const WIDGET_OPTIONS = [
  {
    id: "league_table",
    label: "League Table",
    opts: [
      { id: "default_view", label: "Default view", type: "select", options: [
          { value: "overall", label: "Overall" },
          { value: "home",    label: "Home" },
          { value: "away",    label: "Away" },
      ]},
      { id: "limit",    label: "Rows shown",    type: "range", min: 5, max: 20, step: 1, default: 10 },
      { id: "poll_ms",  label: "Poll interval", type: "select", options: [
          { value: 15000,  label: "15 s (live)" },
          { value: 30000,  label: "30 s" },
          { value: 60000,  label: "60 s" },
          { value: 300000, label: "5 min" },
      ]},
    ],
  },
  {
    id: "fixtures",
    label: "Fixtures / Form",
    opts: [
      { id: "limit",      label: "Rows shown",     type: "range", min: 3, max: 10, step: 1, default: 5 },
      { id: "show_form",  label: "Show form chips", type: "toggle", default: true },
    ],
  },
  {
    id: "team_stats",
    label: "Team Stats",
    opts: [
      { id: "stat_categories", label: "Stat categories", type: "select", options: [
          { value: "all",      label: "All" },
          { value: "attack",   label: "Attack only" },
          { value: "defence",  label: "Defence only" },
          { value: "standard", label: "Standard" },
      ]},
    ],
  },
  {
    id: "shot_map",
    label: "Shot Map",
    opts: [
      { id: "games_back", label: "Games shown (pre)", type: "range", min: 1, max: 10, step: 1, default: 5 },
    ],
  },
  {
    id: "xg_timeline",
    label: "xG Race Graph",
    opts: [
      { id: "chart_style", label: "Chart style", type: "select", options: [
          { value: "area", label: "Area chart" },
          { value: "line", label: "Line chart" },
      ]},
    ],
  },
  {
    id: "bet_prompts",
    label: "Bet Prompts",
    opts: [
      { id: "max_prompts", label: "Max prompts shown", type: "range", min: 1, max: 5, step: 1, default: 3 },
    ],
  },
];

// Default L3 option values.
const DEFAULT_L3 = {
  league_table:     { default_view: "overall", limit: 10, poll_ms: 60000 },
  fixtures:         { limit: 5, show_form: true },
  team_stats:       { stat_categories: "all" },
  shot_map:         { games_back: 5 },
  xg_timeline:      { chart_style: "area" },
  bet_prompts:      { max_prompts: 3 },
};

// Build default pages state.
function buildDefaultPages() {
  const pages = {};
  for (const [pageType, tabs] of Object.entries(PAGE_TABS)) {
    const tabState = {};
    for (const t of tabs) {
      tabState[t.id] = { enabled: t.defaultEnabled, default: t.defaultDefault };
    }
    pages[pageType] = {
      tabs: tabState,
      options: JSON.parse(JSON.stringify(DEFAULT_L3)),
    };
  }
  return pages;
}

let state = loadState();
let currentPageType = "match";   // tracks which page-type tab is selected

const els = {
  controls: document.querySelector(".ct-controls"),
  themeButtons: document.querySelectorAll(".ct-theme-btn"),
  output: document.querySelector("#ct-output-code code"),
  configOutput: document.querySelector("#ct-config-output code"),
  resetBtn: document.querySelector("#ct-reset"),
  copyBtn: document.querySelector("#ct-copy"),
  copyConfigBtn: document.querySelector("#ct-copy-config"),
  overrides: document.querySelector("#sr-preview-overrides"),
  widgetRoot: document.querySelector("#sr-widget-root"),
  widgetList: document.querySelector("#ct-widget-list"),
  pageTypeButtons: document.querySelectorAll("[data-page-type]"),
  pageTypeTabs: document.querySelectorAll(".ct-page-tab"),
  l2Container: document.querySelector("#ct-l2-tabs"),
  l3Container: document.querySelector("#ct-l3-options"),
};

// Active page type being configured in L2/L3 panels.
let activePage = "match";

init();

function init() {
  renderControls();
  attachThemeButtons();
  attachOutputButtons();
  attachPageTypeButtons();
  renderWidgetList();
  attachPageTabs();
  renderL2(activePage);
  renderL3(activePage);
  applyAll();
}

// ---- Widget availability panel ----

function attachPageTypeButtons() {
  if (!els.pageTypeButtons.length) return;
  els.pageTypeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentPageType = btn.dataset.pageType;
      els.pageTypeButtons.forEach((b) => {
        b.classList.toggle("ct-page-type-btn--active", b.dataset.pageType === currentPageType);
      });
      renderWidgetList();
    });
  });
}

function renderWidgetList() {
  if (!els.widgetList) return;
  const availableWidgets = WIDGETS.filter(w => w.pageTypes.includes(currentPageType));
  els.widgetList.innerHTML = "";
  for (const widget of availableWidgets) {
    const row = document.createElement("div");
    row.className = "ct-widget-row";
    row.innerHTML = `
      <label class="ct-widget-row__label">
        <input type="checkbox" class="ct-widget-row__checkbox" data-widget-id="${widget.id}" checked>
        ${widget.label}
      </label>
      <span class="ct-widget-row__pages">${widget.pageTypes.join(", ")}</span>
    `;
    els.widgetList.appendChild(row);
  }
}

// ---- State ----

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const defaultPages = buildDefaultPages();
      // Deep-merge saved pages on top of defaults so new widgets aren't lost.
      const pages = {};
      for (const pt of Object.keys(defaultPages)) {
        pages[pt] = {
          tabs: { ...defaultPages[pt].tabs, ...(parsed.pages?.[pt]?.tabs || {}) },
          options: { ...defaultPages[pt].options, ...(parsed.pages?.[pt]?.options || {}) },
        };
      }
      return {
        theme:  parsed.theme  || "light",
        shared: { ...DEFAULT_SHARED, ...(parsed.shared || {}) },
        light:  { ...DEFAULT_LIGHT,  ...(parsed.light  || {}) },
        dark:   { ...DEFAULT_DARK,   ...(parsed.dark   || {}) },
        pages,
      };
    }
  } catch (err) {
    console.warn("[config-tool] localStorage read failed", err);
  }
  return {
    theme: "light",
    shared: { ...DEFAULT_SHARED },
    light:  { ...DEFAULT_LIGHT },
    dark:   { ...DEFAULT_DARK },
    pages:  buildDefaultPages(),
  };
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (err) { console.warn("[config-tool] localStorage write failed", err); }
}

// Returns the bucket (state.shared / state.light / state.dark) that owns
// the given variable, based on the VARIABLES table.
function bucketFor(varId) {
  const def = VARIABLES.find((v) => v.id === varId);
  if (!def) return state[state.theme];
  return def.scope === "shared" ? state.shared : state[state.theme];
}

function valueFor(varId) {
  return bucketFor(varId)[varId];
}

// ---- Controls rendering ----

function renderControls() {
  const grouped = new Map();
  for (const v of VARIABLES) {
    if (!grouped.has(v.section)) grouped.set(v.section, []);
    grouped.get(v.section).push(v);
  }

  els.controls.innerHTML = "";
  for (const [section, vars] of grouped) {
    const sectionEl = document.createElement("section");
    sectionEl.className = "ct-section";
    sectionEl.innerHTML = `<h4 class="ct-section__heading">${section}</h4>`;
    for (const v of vars) sectionEl.appendChild(renderControl(v));
    els.controls.appendChild(sectionEl);
  }
}

function renderControl(v) {
  const value = valueFor(v.id);
  const row = document.createElement("div");
  row.className = "ct-row";
  row.innerHTML = `
    <div>
      <label for="ct-${v.id}" class="ct-row__label">${v.label}</label>
      ${v.hint ? `<span class="ct-row__hint">${v.hint}</span>` : ""}
    </div>
    <div data-control></div>
  `;
  const slot = row.querySelector("[data-control]");

  if (v.type === "color")       slot.appendChild(buildColor(v.id, value));
  else if (v.type === "select") slot.appendChild(buildSelect(v.id, value, v.options));
  else if (v.type === "range")  slot.appendChild(buildRange(v.id, value, v));
  return row;
}

function buildColor(id, value) {
  const wrap = document.createElement("div");
  wrap.className = "ct-color-wrap";
  const swatch = document.createElement("input");
  swatch.type = "color";
  swatch.id = `ct-${id}`;
  swatch.value = value;
  const hex = document.createElement("input");
  hex.type = "text";
  hex.className = "ct-color-wrap__hex";
  hex.value = value.toUpperCase();
  hex.maxLength = 7;
  swatch.addEventListener("input", () => {
    hex.value = swatch.value.toUpperCase();
    setVar(id, swatch.value);
  });
  hex.addEventListener("change", () => {
    let val = hex.value.trim();
    if (val && !val.startsWith("#")) val = `#${val}`;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      swatch.value = val.toLowerCase();
      hex.value = val.toUpperCase();
      setVar(id, val.toLowerCase());
    } else {
      hex.value = swatch.value.toUpperCase();
    }
  });
  wrap.appendChild(swatch);
  wrap.appendChild(hex);
  return wrap;
}

function buildSelect(id, value, options) {
  const sel = document.createElement("select");
  sel.className = "ct-select";
  sel.id = `ct-${id}`;
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    if (String(opt.value) === String(value)) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => setVar(id, sel.value));
  return sel;
}

function buildRange(id, value, v) {
  const wrap = document.createElement("div");
  wrap.className = "ct-range-wrap";
  const range = document.createElement("input");
  range.type = "range";
  range.id = `ct-${id}`;
  range.min = v.min;
  range.max = v.max;
  range.step = v.step;
  range.value = parseInt(value, 10);
  const out = document.createElement("span");
  out.className = "ct-range-wrap__value";
  out.textContent = value;
  range.addEventListener("input", () => {
    const newVal = `${range.value}${v.unit || ""}`;
    out.textContent = newVal;
    setVar(id, newVal);
  });
  wrap.appendChild(range);
  wrap.appendChild(out);
  return wrap;
}

// ---- L2: Tab configuration ----

function renderL2(pageType) {
  if (!els.l2Container) return;
  const tabs = PAGE_TABS[pageType] || [];
  const tabState = state.pages[pageType].tabs;

  els.l2Container.innerHTML = "";
  for (const t of tabs) {
    const ts = tabState[t.id] || { enabled: t.defaultEnabled, default: t.defaultDefault };
    const row = document.createElement("div");
    row.className = "ct-tab-row";

    row.innerHTML = `
      <label class="ct-tab-row__toggle">
        <input type="checkbox" data-tab-id="${t.id}" data-field="enabled" ${ts.enabled ? "checked" : ""} />
        <span class="ct-tab-row__label">${t.label}${phaseBadge(t.id)}</span>
      </label>
      <label class="ct-tab-row__default ${ts.enabled ? "" : "ct-tab-row__default--disabled"}">
        <input type="radio" name="ct-default-tab-${pageType}" data-tab-id="${t.id}" data-field="default"
          ${ts.default ? "checked" : ""} ${ts.enabled ? "" : "disabled"} />
        Default
      </label>
    `;

    // Toggle enable/disable
    row.querySelector("[data-field='enabled']").addEventListener("change", (e) => {
      state.pages[pageType].tabs[t.id].enabled = e.target.checked;
      // If disabled, can't be default
      if (!e.target.checked && state.pages[pageType].tabs[t.id].default) {
        state.pages[pageType].tabs[t.id].default = false;
      }
      saveState();
      renderL2(pageType);
      updateConfigOutput();
    });

    // Set as default tab
    row.querySelector("[data-field='default']").addEventListener("change", (e) => {
      if (e.target.checked) {
        // Clear all other defaults for this page
        for (const key of Object.keys(state.pages[pageType].tabs)) {
          state.pages[pageType].tabs[key].default = false;
        }
        state.pages[pageType].tabs[t.id].default = true;
        saveState();
        updateConfigOutput();
      }
    });

    els.l2Container.appendChild(row);
  }
}

// ---- L3: Options configuration ----

function renderL3(pageType) {
  if (!els.l3Container) return;
  const tabState = state.pages[pageType].tabs;
  const optState = state.pages[pageType].options;

  els.l3Container.innerHTML = "";

  // Only show options for widgets that are enabled on this page type AND have option definitions.
  const pageTabIds = new Set((PAGE_TABS[pageType] || []).map((t) => t.id));
  const relevantOpts = WIDGET_OPTIONS.filter(
    (wo) => pageTabIds.has(wo.id) && tabState[wo.id]?.enabled
  );

  if (relevantOpts.length === 0) {
    els.l3Container.innerHTML = `<p class="ct-l3-empty">Enable widgets above to configure their options.</p>`;
    return;
  }

  for (const wo of relevantOpts) {
    if (!optState[wo.id]) optState[wo.id] = { ...(DEFAULT_L3[wo.id] || {}) };
    const group = document.createElement("div");
    group.className = "ct-l3-group";
    group.innerHTML = `<h5 class="ct-l3-group__title">${wo.label}</h5>`;

    for (const opt of wo.opts) {
      const currentVal = optState[wo.id][opt.id] ?? opt.default ?? "";
      const row = document.createElement("div");
      row.className = "ct-row";
      row.innerHTML = `
        <div><label class="ct-row__label">${opt.label}</label></div>
        <div data-control></div>
      `;
      const slot = row.querySelector("[data-control]");

      if (opt.type === "select") {
        const sel = document.createElement("select");
        sel.className = "ct-select";
        for (const o of opt.options) {
          const el = document.createElement("option");
          el.value = o.value;
          el.textContent = o.label;
          if (String(o.value) === String(currentVal)) el.selected = true;
          sel.appendChild(el);
        }
        sel.addEventListener("change", () => {
          // Coerce numeric string values back to numbers for poll_ms etc.
          const v = isNaN(Number(sel.value)) ? sel.value : Number(sel.value);
          state.pages[pageType].options[wo.id][opt.id] = v;
          saveState();
          updateConfigOutput();
        });
        slot.appendChild(sel);
      } else if (opt.type === "range") {
        const wrap = document.createElement("div");
        wrap.className = "ct-range-wrap";
        const range = document.createElement("input");
        range.type = "range";
        range.min = opt.min;
        range.max = opt.max;
        range.step = opt.step;
        range.value = currentVal;
        const out = document.createElement("span");
        out.className = "ct-range-wrap__value";
        out.textContent = currentVal;
        range.addEventListener("input", () => {
          out.textContent = range.value;
          state.pages[pageType].options[wo.id][opt.id] = Number(range.value);
          saveState();
          updateConfigOutput();
        });
        wrap.appendChild(range);
        wrap.appendChild(out);
        slot.appendChild(wrap);
      } else if (opt.type === "toggle") {
        const lbl = document.createElement("label");
        lbl.className = "ct-toggle";
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = !!currentVal;
        chk.addEventListener("change", () => {
          state.pages[pageType].options[wo.id][opt.id] = chk.checked;
          saveState();
          updateConfigOutput();
        });
        lbl.appendChild(chk);
        lbl.appendChild(document.createTextNode(" On"));
        slot.appendChild(lbl);
      }

      group.appendChild(row);
    }

    els.l3Container.appendChild(group);
  }
}

// ---- Page type tab switcher ----

function attachPageTabs() {
  if (!els.pageTypeTabs.length) return;
  els.pageTypeTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      activePage = btn.dataset.pageType;
      els.pageTypeTabs.forEach((b) => {
        b.classList.toggle("ct-page-tab--active", b.dataset.pageType === activePage);
      });
      renderL2(activePage);
      renderL3(activePage);
    });
  });
}

// ---- SR_CONFIG generation (L1 + L2 + L3) ----

function generateSrConfig() {
  const out = {};

  for (const [pageType, tabs] of Object.entries(PAGE_TABS)) {
    const tabState = state.pages[pageType].tabs;
    const optState = state.pages[pageType].options;

    // L1 + L2: enabled tabs with visible/default flags
    const enabledTabs = tabs
      .filter((t) => tabState[t.id]?.enabled)
      .map((t) => {
        const entry = { id: t.id, label: t.label, default: !!tabState[t.id].default };
        // Homepage can carry pinned context (placeholder — operator fills in their value)
        if (pageType === "homepage" && t.id === "league_table") {
          entry.pinned = { competition_id: "{{page.competition_id}}" };
        }
        return entry;
      });

    // L3: options for enabled widgets only
    const options = {};
    for (const t of tabs) {
      if (tabState[t.id]?.enabled && optState[t.id]) {
        options[t.id] = { ...optState[t.id] };
      }
    }

    out[pageType] = { tabs: enabledTabs, options };
  }

  // Pretty-print as a JS assignment block
  const json = JSON.stringify(out, null, 2);
  return `window.SR_CONFIG = ${json};`;
}

function updateConfigOutput() {
  if (els.configOutput) {
    els.configOutput.textContent = generateSrConfig();
  }
  // Also update the inline preview SR_CONFIG so the widget reflects changes
  const previewScript = document.querySelector("#sr-preview-config");
  if (previewScript) {
    // We can't re-execute an inline script so just leave the preview as-is.
    // In production the operator pastes the generated block.
  }
}

// ---- Update flow ----

function setVar(id, value) {
  bucketFor(id)[id] = value;
  saveState();
  applyAll();
}

function applyAll() {
  els.overrides.textContent = generateCSS();
  els.widgetRoot.setAttribute("data-theme", state.theme);
  els.output.textContent = generateCSS();
  updateConfigOutput();
}

// Build two CSS blocks:
//   .sr-widget                         { shared + light colours }
//   .sr-widget[data-theme="dark"]      { dark colours only }
//
// The first block defines layout AND the light palette so the widget renders
// correctly without any data-theme attribute. The second block overrides only
// the colours when `data-theme="dark"` is set on the widget root.
function generateCSS() {
  const block = (selector, vars) => {
    const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
    return `${selector} {\n${lines.join("\n")}\n}`;
  };
  const lightBlock = block(".sr-widget",                       { ...state.shared, ...state.light });
  const darkBlock  = block('.sr-widget[data-theme="dark"]',    state.dark);
  return `${lightBlock}\n\n${darkBlock}`;
}

// ---- Theme toggle / reset / copy ----

function attachThemeButtons() {
  els.themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.theme = btn.dataset.theme;
      els.themeButtons.forEach((b) => {
        b.classList.toggle("ct-theme-btn--active", b.dataset.theme === state.theme);
      });
      saveState();
      renderControls();    // refresh control values — colour pickers now show the active theme's values
      applyAll();
    });
  });
}

function attachOutputButtons() {
  els.resetBtn.addEventListener("click", () => {
    if (!confirm("Reset all themes, layout, and widget configuration to defaults?")) return;
    state = {
      theme: state.theme,
      shared: { ...DEFAULT_SHARED },
      light:  { ...DEFAULT_LIGHT },
      dark:   { ...DEFAULT_DARK },
      pages:  buildDefaultPages(),
    };
    saveState();
    renderControls();
    renderL2(activePage);
    renderL3(activePage);
    applyAll();
  });

  els.copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(generateCSS());
      flashButton(els.copyBtn, "Copied ✓");
    } catch {
      const range = document.createRange();
      range.selectNode(els.output);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      flashButton(els.copyBtn, "Selected — Cmd+C");
    }
  });

  if (els.copyConfigBtn) {
    els.copyConfigBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(generateSrConfig());
        flashButton(els.copyConfigBtn, "Copied ✓");
      } catch {
        const range = document.createRange();
        range.selectNode(els.configOutput);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        flashButton(els.copyConfigBtn, "Selected — Cmd+C");
      }
    });
  }
}

function flashButton(btn, msg) {
  const original = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = original; }, 1500);
}
