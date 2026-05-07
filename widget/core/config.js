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
      { id: "match_facts",       label: "Match facts",      default: false },
      { id: "attacking_thirds",  label: "Attacking thirds", default: false },
      { id: "shot_map",          label: "Shot map",         default: false },
      { id: "pass_networks",     label: "Pass networks",    default: false },
      { id: "momentum_tracker",  label: "Momentum",         default: false },
      { id: "average_positions", label: "Avg positions",    default: false },
      { id: "bet_prompts",       label: "Bet prompts",      default: false },
    ],
    options: {
      league_table:      { default_view: "overall", limit: 10 },
      fixtures:          { upcoming: 5, past: 5 },
      team_stats:        { default_recency: "season", categories: "all" },
      h2h:               { depth: 5, player_selector: true },
      xg_timeline:       { chart_style: "step", goal_markers: true },
      match_facts:       { categories: "all", commentary_limit: 25 },
      attacking_thirds:  { poll_ms: 30000 },
      shot_map:          { poll_ms: 15000, xg_encoding: "scaled" },
      pass_networks:     { data_recency: "last5", min_pass_threshold: 3 },
      momentum_tracker:  { poll_ms: 60000 },
      average_positions: { data_source: "last5" },
      bet_prompts:       { max_prompts: 5, poll_ms: 30000 },
    },
  },
  competition: {
    tabs: [
      { id: "league_table", label: "Standings",   default: true  },
      { id: "fixtures",     label: "Fixtures",    default: false },
      { id: "bet_prompts",  label: "Bet prompts", default: false },
    ],
    options: {
      league_table: { default_view: "overall", limit: null, poll_ms: 60000 },
      fixtures:     { upcoming: 5, past: 5 },
      bet_prompts:  { max_prompts: 5, poll_ms: 30000 },
    },
  },
  homepage: {
    tabs: [
      { id: "league_table", label: "Standings",   default: true  },
      { id: "fixtures",     label: "Fixtures",    default: false },
      { id: "bet_prompts",  label: "Bet prompts", default: false },
      { id: "match_facts",  label: "Match facts", default: false },
    ],
    options: {
      league_table: { default_view: "overall", limit: 10, poll_ms: 60000 },
      fixtures:     { upcoming: 5, past: 5 },
      bet_prompts:  { max_prompts: 5, poll_ms: 30000 },
      match_facts:  { facts_per_section: 3, commentary_limit: 25, commentary_detail: "full", poll_ms: 5000 },
    },
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
