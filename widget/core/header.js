/* Persistent match-context header.
 *
 * Sits above the tabs and remains constant regardless of the active
 * tab (spec §2.3). Renders teams, score (live), and minute (live).
 * Update is in-place — same DOM nodes, only text content changes.
 */

export function renderHeader(rootEl, ctx) {
  rootEl.innerHTML = `
    <div class="sr-header" role="banner">
      <div class="sr-header__team sr-header__team--home">
        <div class="sr-header__team-crest" aria-hidden="true">${escape(ctx.home.short_name)}</div>
        <div class="sr-header__team-name">${escape(ctx.home.name)}</div>
      </div>
      <div class="sr-header__center">
        <div class="sr-header__score" data-sr="score">${formatScore(ctx)}</div>
        <div class="sr-header__status ${ctx.phase === "live" ? "sr-header__status--live" : ""}" data-sr="status">${formatStatus(ctx)}</div>
      </div>
      <div class="sr-header__team sr-header__team--away">
        <div class="sr-header__team-crest" aria-hidden="true">${escape(ctx.away.short_name)}</div>
        <div class="sr-header__team-name">${escape(ctx.away.name)}</div>
      </div>
    </div>
  `;
}

export function updateHeader(rootEl, ctx) {
  const score = rootEl.querySelector('[data-sr="score"]');
  const status = rootEl.querySelector('[data-sr="status"]');
  if (score) score.textContent = formatScore(ctx);
  if (status) {
    status.textContent = formatStatus(ctx);
    status.classList.toggle("sr-header__status--live", ctx.phase === "live");
  }
}

function formatScore(ctx) {
  if (ctx.home.score === null || ctx.away.score === null) return "vs";
  return `${ctx.home.score} – ${ctx.away.score}`;
}

function formatStatus(ctx) {
  if (ctx.phase === "live")  return `LIVE · ${ctx.minute}'`;
  if (ctx.phase === "ft")    return "Full time";
  if (ctx.phase === "pre")   return formatKickoff(ctx.kickoff_at);
  return "";
}

function formatKickoff(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Scheduled";
  const date = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

function escape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
