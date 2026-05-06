/* Sportingrisk widget loader.
 *
 * Single entry point loaded via the operator's <script> tag.
 * Reads data-* attributes, injects the default stylesheet, and mounts
 * the widget into the operator-provided root element.
 *
 * Usage (per spec §8.1):
 *   <div id="sr-widget-root"></div>
 *   <script src=".../loader.js"
 *           data-client="boylesports"
 *           data-page-type="match"
 *           data-match-id="ars-liv-2026-05-06"></script>
 *
 * Required attributes:
 *   data-client       — operator identifier (informational; theming applied via CSS)
 *   data-page-type    — "match" | "competition" | "homepage"
 *
 * Conditionally required:
 *   data-match-id        — required when page-type=match
 *   data-competition-id  — required when page-type=competition
 *
 * Optional:
 *   data-api-base     — override the API base (defaults to same-origin /api/v1)
 *   data-root         — id of root element to mount into (defaults to "sr-widget-root")
 *   data-dev-mode     — "1" enables the dev phase-toggle button on the example page
 */

(function () {
  const script = document.currentScript;
  if (!script) {
    console.error("[sr-widget] loader: no currentScript — aborting");
    return;
  }

  const ds = script.dataset;
  const pageType = ds.pageType;
  const matchId = ds.matchId;
  const competitionId = ds.competitionId;
  const rootId = ds.root || "sr-widget-root";
  const devMode = ds.devMode === "1";

  if (!pageType) {
    console.error("[sr-widget] loader: data-page-type is required");
    return;
  }
  if (pageType === "match" && !matchId) {
    console.error("[sr-widget] loader: data-match-id is required for page-type=match");
    return;
  }
  if (pageType === "competition" && !competitionId) {
    console.error("[sr-widget] loader: data-competition-id is required for page-type=competition");
    return;
  }

  // Resolve API base. By default, derive from the loader's own URL so the
  // widget stays on the same origin as the API in any deployment.
  let apiBase = ds.apiBase;
  if (!apiBase) {
    const u = new URL(script.src, window.location.href);
    apiBase = u.origin + "/api/v1";
  }
  // Resolve the widget asset base (where this loader is served from) so we can
  // load the stylesheet and dynamic ES modules from the same place.
  const assetBase = (() => {
    const u = new URL(script.src, window.location.href);
    return u.origin + u.pathname.replace(/\/loader\.js$/, "");
  })();

  // Inject the default stylesheet — once, even if multiple loaders fire.
  if (!document.querySelector('link[data-sr-widget-css]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${assetBase}/widget.css`;
    link.setAttribute("data-sr-widget-css", "");
    document.head.appendChild(link);
  }

  // Boot — dynamic-import the orchestrator so the loader stays a small classic
  // script (works in any browser; ES modules are loaded once needed).
  const onReady = () => {
    const rootEl = document.getElementById(rootId);
    if (!rootEl) {
      console.error(`[sr-widget] loader: no element with id "${rootId}"`);
      return;
    }
    import(`${assetBase}/core/widget.js`)
      .then(({ Widget }) => {
        const widget = new Widget({
          rootEl, apiBase, pageType, matchId, competitionId, devMode,
        });
        window.__srWidget = widget;
        return widget.start();
      })
      .catch((err) => {
        console.error("[sr-widget] loader: failed to boot widget", err);
      });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  } else {
    onReady();
  }
})();
