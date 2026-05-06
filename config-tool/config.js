/* Theming tool — controller.
 *
 * State model:
 *   {
 *     theme:  'light' | 'dark',
 *     shared: { typography + spacing — applied in BOTH modes },
 *     light:  { colour palette },
 *     dark:   { colour palette },
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

let state = loadState();

const els = {
  controls: document.querySelector(".ct-controls"),
  themeButtons: document.querySelectorAll(".ct-theme-btn"),
  output: document.querySelector("#ct-output-code code"),
  resetBtn: document.querySelector("#ct-reset"),
  copyBtn: document.querySelector("#ct-copy"),
  overrides: document.querySelector("#sr-preview-overrides"),
  widgetRoot: document.querySelector("#sr-widget-root"),
};

init();

function init() {
  renderControls();
  attachThemeButtons();
  attachOutputButtons();
  applyAll();
}

// ---- State ----

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        theme:  parsed.theme  || "light",
        shared: { ...DEFAULT_SHARED, ...(parsed.shared || {}) },
        light:  { ...DEFAULT_LIGHT,  ...(parsed.light  || {}) },
        dark:   { ...DEFAULT_DARK,   ...(parsed.dark   || {}) },
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
    if (opt.value === value) o.selected = true;
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
    if (!confirm("Reset all themes and layout to defaults?")) return;
    state = {
      theme: state.theme,
      shared: { ...DEFAULT_SHARED },
      light:  { ...DEFAULT_LIGHT },
      dark:   { ...DEFAULT_DARK },
    };
    saveState();
    renderControls();
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
}

function flashButton(btn, msg) {
  const original = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = original; }, 1500);
}
