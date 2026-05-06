/* Per-page-type widget configuration.
 *
 * Mirrors spec §6 — three customisation levels:
 *   L1 (page-type widget selection): which widget tabs are enabled
 *   L2 (tab-level): which tabs visible, default tab
 *   L3 (per-widget behaviour): row counts, default views, etc.
 *
 * The widget reads its config from window.SR_CONFIG if set, otherwise
 * falls back to the defaults below. The example page (component 4)
 * sets window.SR_CONFIG to demo per-operator config; component 3
 * (theming tool) generates the JS to set it. In production this
 * becomes GET /api/v1/config/{data-client}.
 */

const DEFAULT_CONFIG = {
  match: {
    tabs: [
      { id: "league_table",   label: "Standings",     default: false },
      { id: "fixtures",       label: "Form",          default: false },
      { id: "lineups",        label: "Line-ups",      default: true  },
      { id: "team_stats",     label: "Team stats",    default: false },
      { id: "h2h",            label: "Head to head",  default: false },
      { id: "xg_timeline",    label: "xG race",       default: false },
      { id: "match_facts",    label: "Match facts",   default: false },
    ],
    options: {
      league_table: { default_view: "overall", limit: 10 },
      fixtures:     { upcoming: 5, past: 5 },
      team_stats:   { default_recency: "season", categories: "all" },
      h2h:          { depth: 5, player_selector: true },
      xg_timeline:  { chart_style: "step", goal_markers: true },
      match_facts:  { categories: "all", commentary_limit: 25 },
    },
  },
  competition: {
    tabs: [
      { id: "league_table", label: "Standings", default: true  },
      { id: "fixtures",     label: "Fixtures",  default: false },
    ],
    options: {
      league_table: { default_view: "overall", limit: null },
      fixtures:     { upcoming: 5, past: 5 },
    },
  },
  homepage: {
    tabs: [],
    options: {},
  },
};

export function loadConfig(pageType) {
  const userConfig = (typeof window !== "undefined" && window.SR_CONFIG) ? window.SR_CONFIG : null;
  const base = DEFAULT_CONFIG[pageType] || DEFAULT_CONFIG.homepage;
  if (!userConfig || !userConfig[pageType]) return base;
  // Shallow merge — operator overrides win at the tab/option level.
  return {
    tabs: userConfig[pageType].tabs || base.tabs,
    options: { ...base.options, ...(userConfig[pageType].options || {}) },
  };
}
