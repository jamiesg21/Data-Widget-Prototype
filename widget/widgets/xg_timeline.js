/* xG race graph — vanilla SVG.
 *
 * Hidden pre-match (spec §3.3 VII). Cumulative xG for both teams across
 * the match timeline; three chart styles per the spec option:
 *   "step"   — step-line (default)
 *   "smooth" — smooth Bézier curve through cumulative points
 *   "bar"    — one bar per shot (cumulative xG height)
 * Goal markers on/off via the goal_markers option.
 *
 * SVG was chosen over Chart.js because:
 *  - One chart, ~100 lines — Chart.js (~80KB) is overkill
 *  - SVG inherits CSS variables (currentColor, etc.) so theming is
 *    automatic; Chart.js needs JS-level color config
 *  - Pure DOM = inspectable + no canvas accessibility tradeoffs
 */

const PAD = { top: 16, right: 16, bottom: 28, left: 36 };

export default {
  async mount(panelEl, ctx) {
    this.ctx = ctx;
    this.panelEl = panelEl;
    this.chartStyle = ctx.options.chart_style || "step";
    this.goalMarkers = ctx.options.goal_markers !== false;
    await this._fetchAndRender();
  },

  async update(ctx) {
    this.ctx = ctx;
    this.chartStyle = ctx.options.chart_style || this.chartStyle;
    this.goalMarkers = ctx.options.goal_markers !== false;
    await this._fetchAndRender();
  },

  async _fetchAndRender() {
    const phase = this.ctx.context.phase;
    if (phase === "pre") {
      this.panelEl.innerHTML = `<div class="sr-widget__empty">xG race tracking starts at kick-off.</div>`;
      return;
    }
    const matchId = this.ctx.context.match_id;
    this.panelEl.innerHTML = `<div class="sr-widget__loading">Loading xG timeline…</div>`;
    try {
      const env = await this.ctx.api.get(`/matches/${encodeURIComponent(matchId)}/xg-timeline`);
      this._render(env.data);
    } catch (err) {
      this.panelEl.innerHTML = `<div class="sr-widget__error">Failed to load xG timeline — ${escape(err.message)}</div>`;
    }
  },

  _render(data) {
    if (!data) {
      this.panelEl.innerHTML = `<div class="sr-widget__empty">No xG data yet.</div>`;
      return;
    }
    const W = 560, H = 280;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const minuteMax = Math.max(90, data.minute_now || 90);
    const xgMax = Math.max(
      0.6,
      ...data.home.cumulative.map((p) => p.xg),
      ...data.away.cumulative.map((p) => p.xg),
    ) * 1.1;

    const xScale = (m) => PAD.left + (m / minuteMax) * innerW;
    const yScale = (xg) => PAD.top + innerH - (xg / xgMax) * innerH;
    const yBase = yScale(0);

    // Build the chart marks per the chosen style. Step = right-angle path;
    // smooth = monotone-cubic Bézier; bar = one column per cumulative point.
    let homeMarks, awayMarks;
    if (this.chartStyle === "bar") {
      homeMarks = barRects(data.home.cumulative, xScale, yScale, yBase, "home", minuteMax, innerW);
      awayMarks = barRects(data.away.cumulative, xScale, yScale, yBase, "away", minuteMax, innerW);
    } else {
      const builder = this.chartStyle === "smooth" ? smoothPath : stepPath;
      const homePath = builder(data.home.cumulative, xScale, yScale);
      const awayPath = builder(data.away.cumulative, xScale, yScale);
      homeMarks = `<path d="${homePath}" class="sr-xg__line sr-xg__line--home" fill="none"></path>`;
      awayMarks = `<path d="${awayPath}" class="sr-xg__line sr-xg__line--away" fill="none"></path>`;
    }

    const homeMarkers = this.goalMarkers ? data.home.cumulative.filter((p) => p.is_goal).map((p) =>
      `<circle cx="${xScale(p.minute)}" cy="${yScale(p.xg)}" r="5" class="sr-xg__goal sr-xg__goal--home"><title>Goal — ${p.minute}' (${p.xg.toFixed(2)} xG)</title></circle>`
    ).join("") : "";
    const awayMarkers = this.goalMarkers ? data.away.cumulative.filter((p) => p.is_goal).map((p) =>
      `<circle cx="${xScale(p.minute)}" cy="${yScale(p.xg)}" r="5" class="sr-xg__goal sr-xg__goal--away"><title>Goal — ${p.minute}' (${p.xg.toFixed(2)} xG)</title></circle>`
    ).join("") : "";

    const xTicks = [0, 15, 30, 45, 60, 75, 90].filter((m) => m <= minuteMax).map((m) =>
      `<g class="sr-xg__tick">
        <line x1="${xScale(m)}" x2="${xScale(m)}" y1="${PAD.top}" y2="${PAD.top + innerH}"></line>
        <text x="${xScale(m)}" y="${PAD.top + innerH + 16}" text-anchor="middle">${m}'</text>
      </g>`
    ).join("");

    const yTickValues = [0, xgMax / 2, xgMax];
    const yTicks = yTickValues.map((v) =>
      `<g class="sr-xg__tick">
        <line x1="${PAD.left}" x2="${PAD.left + innerW}" y1="${yScale(v)}" y2="${yScale(v)}"></line>
        <text x="${PAD.left - 6}" y="${yScale(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>
      </g>`
    ).join("");

    const styleOptions = { step: "Step", smooth: "Smooth", bar: "Bars" };
    const styleButtons = Object.entries(styleOptions).map(([id, label]) =>
      `<button type="button" class="sr-pill sr-pill--small ${id === this.chartStyle ? "sr-pill--active" : ""}" data-style="${id}">${label}</button>`
    ).join("");

    this.panelEl.innerHTML = `
      <div class="sr-toolbar">
        <div class="sr-pill-group sr-pill-group--secondary">${styleButtons}</div>
        <label class="sr-xg__markers-toggle">
          <input type="checkbox" data-markers ${this.goalMarkers ? "checked" : ""} /> Goal markers
        </label>
      </div>
      <div class="sr-xg">
        <div class="sr-xg__legend">
          <span class="sr-xg__legend-item"><span class="sr-xg__legend-swatch sr-xg__legend-swatch--home"></span>${escape(data.home.team_id.toUpperCase())} · ${data.home.total_xg.toFixed(2)} xG</span>
          <span class="sr-xg__legend-item"><span class="sr-xg__legend-swatch sr-xg__legend-swatch--away"></span>${escape(data.away.team_id.toUpperCase())} · ${data.away.total_xg.toFixed(2)} xG</span>
          <span class="sr-xg__minute">${data.minute_now}'</span>
        </div>
        <svg viewBox="0 0 ${W} ${H}" class="sr-xg__chart" preserveAspectRatio="xMidYMid meet" role="img" aria-label="xG race chart">
          <g class="sr-xg__axes">${xTicks}${yTicks}</g>
          ${homeMarks}
          ${awayMarks}
          ${homeMarkers}${awayMarkers}
        </svg>
      </div>
    `;

    this.panelEl.querySelectorAll(".sr-pill[data-style]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.chartStyle = btn.dataset.style;
        this._render(data);
      });
    });
    const cb = this.panelEl.querySelector("[data-markers]");
    if (cb) cb.addEventListener("change", () => {
      this.goalMarkers = cb.checked;
      this._render(data);
    });
  },
};

function stepPath(points, xScale, yScale) {
  if (!points.length) return "";
  let d = `M ${xScale(0)} ${yScale(0)}`;
  let prevY = yScale(0);
  for (const p of points) {
    const x = xScale(p.minute);
    const y = yScale(p.xg);
    d += ` L ${x} ${prevY} L ${x} ${y}`;
    prevY = y;
  }
  return d;
}

// Smooth path — quadratic Bézier through midpoints. Cumulative xG is
// monotone-increasing so a smooth curve never dips below the previous point.
function smoothPath(points, xScale, yScale) {
  if (!points.length) return "";
  const pts = [{ minute: 0, xg: 0 }, ...points];
  const xy = pts.map((p) => [xScale(p.minute), yScale(p.xg)]);
  let d = `M ${xy[0][0]} ${xy[0][1]}`;
  for (let i = 1; i < xy.length; i++) {
    const [x0, y0] = xy[i - 1];
    const [x1, y1] = xy[i];
    const cx = (x0 + x1) / 2;
    d += ` Q ${cx} ${y0} ${x1} ${y1}`;
  }
  return d;
}

// Bar style — one rect per cumulative point. Width based on the spacing
// between consecutive minutes; clipped so bars never overflow the next.
function barRects(points, xScale, yScale, yBase, side, minuteMax, innerW) {
  if (!points.length) return "";
  const minMinuteGap = 2;  // visual minimum
  return points.map((p, i) => {
    const next = points[i + 1];
    const span = next ? next.minute - p.minute : Math.max(minMinuteGap, 4);
    const w = Math.max(2, (span / minuteMax) * innerW * 0.85);
    const x = xScale(p.minute) - w / 2;
    const y = yScale(p.xg);
    const h = yBase - y;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="sr-xg__bar sr-xg__bar--${side}"><title>${p.minute}' · ${p.xg.toFixed(2)} xG${p.is_goal ? " · GOAL" : ""}</title></rect>`;
  }).join("");
}

function escape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
