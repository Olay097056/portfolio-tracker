// frontend/src/api/types.ts

// Shared ticker-autocomplete typeahead (GET /api/screener/search), used by every
// "type a ticker" input across the app -- see components/TickerAutocomplete.tsx.
export interface StockSearchResult {
  symbol: string;
  company_name: string;
}

// --- Fear & Greed index tool ---

export interface FearGreedPoint {
  t: number; // epoch milliseconds
  value: number;
}

export interface FearGreedIndicator {
  key: string;
  label: string;
  score: number | null;
  rating: string | null;
  // The indicator's own raw reading (a VIX level, a % deviation) -- what the sparkline
  // plots. Not the same quantity as `score`, which is the 0-100 normalisation.
  latest_value: number | null;
  series: FearGreedPoint[];
}

export interface FearGreed {
  score: number;
  rating: string | null;
  updated_at: string;
  previous_close: number | null;
  previous_1_week: number | null;
  previous_1_month: number | null;
  previous_1_year: number | null;
  history: FearGreedPoint[];
  indicators: FearGreedIndicator[];
  // "cnn" is CNN's own seven-input index. "computed" is this app's own four-input
  // composite, used only when CNN is unreachable -- a different number, not a stand-in.
  source: 'cnn' | 'computed';
}

// --- Stock Comparison tool (proxies konbalongtun's public stock-summaries API) ---

export interface CompareSuggestion {
  symbol: string;
  name: string;
  sector: string | null;
  logo_url: string | null;
}

// `metrics` values are upstream-formatted strings ("4,559.02B", "-7.24%", "344.57 -10.35%")
// carried through verbatim, or null when the field genuinely doesn't exist for that
// instrument (an ETF has no P/E, no margins, no EPS) -- rendered as "-", never 0.
export interface ComparableStock {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  logo_url: string | null;
  price: number | null;
  target_price: number | null;
  analyst_target_upside_pct: number | null;
  metrics: Record<string, string | null>;
}

export interface Portfolio {
  id: number;
  name: string;
  cash_usd: number;
  target_allocation_pct: number | null;
  created_at: string;
}

export interface PortfolioCreateInput {
  name: string;
  cash_usd?: number;
  target_allocation_pct?: number | null;
}

export interface PortfolioUpdateInput {
  name?: string;
  cash_usd?: number;
  target_allocation_pct?: number | null;
}

export interface PortfolioTargetUpdate {
  id: number;
  target_allocation_pct: number;
}

export interface Holding {
  id: number;
  portfolio_id: number;
  ticker: string;
  shares: number;
  avg_cost_usd: number;
  target_allocation_pct: number | null;
  realized_pnl_usd: number;
  created_at: string;
  updated_at: string;
}

export interface HoldingCreateInput {
  ticker: string;
  shares: number;
  avg_cost_usd: number;
  target_allocation_pct?: number | null;
}

export interface HoldingUpdateInput {
  ticker?: string;
  shares?: number;
  avg_cost_usd?: number;
  target_allocation_pct?: number | null;
  realized_pnl_usd?: number;
}

export interface HoldingStats {
  ticker: string;
  shares: number;
  avg_cost_usd: number;
  current_price: number;
  value: number;
  current_pct: number;
  target_pct: number | null;
  deviation_pp: number | null;
  severity: 'green' | 'yellow' | 'red' | null;
  unrealized_pnl: number;
  realized_pnl: number;
}

export interface PortfolioSummary {
  id: number;
  name: string;
  cash_usd: number;
  target_allocation_pct: number | null;
  holdings_value: number;
  total_value: number;
  unrealized_pnl: number;
  realized_pnl: number;
  holdings: HoldingStats[];
}

export interface MarketData {
  price: number | null;
  dividend_yield_pct: number | null;
  growth_rate_pct: number | null;
  // How many years of real price history growth_rate_pct was computed over. A short window
  // (a recently-listed ticker) means the annualized rate is real but less reliable as a
  // long-term figure -- callers use this to show a warning, never to hide the number.
  growth_rate_years_used: number | null;
}

export interface WatchlistItem {
  id: number;
  ticker: string;
  category: string | null;
  created_at: string;
}

export interface WatchlistItemCreateInput {
  ticker: string;
  category?: string | null;
}

export type ScanPeriod = '1d' | '1w' | '1m';

export interface PriceSignalRow {
  ticker: string;
  percent_change_pct: number | null;
  rsi_14: number | null;
  volume_ratio: number | null;
  distance_from_sma50_pct: number | null;
  bb_width_pct: number | null;
  bb_width_percentile: number | null;
  atr_pct: number | null;
}

export interface DividendSignalRow {
  ticker: string;
  price: number | null;
  gross_yield_pct: number | null;
  payment_frequency: number | null;
  dividend_growth_pct: number | null;
}

export interface TrendingRow {
  ticker: string;
  name: string;
  price: number | null;
  change_pct: number | null;
}

export interface TrendingData {
  gainers: TrendingRow[] | null;
  losers: TrendingRow[] | null;
  most_active: TrendingRow[] | null;
  api_key_configured: boolean;
}

export type ChartRange = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y';

export interface ChartPoint {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Zone {
  id: number | null;
  price: number;
  kind: 'support' | 'resistance' | 'freestyle';
  strength: number | null;
  source: 'auto' | 'manual';
}

export interface ZoneInput {
  kind: 'support' | 'resistance' | 'freestyle';
  price: number;
}

export interface ChartData {
  points: ChartPoint[] | null;
  zones: Zone[];
}

export interface TickerPosition {
  ticker: string;
  portfolio_id: number;
  portfolio_name: string;
  shares: number;
  avg_cost_usd: number;
  current_price: number | null;
  market_value_usd: number | null;
  unrealized_pnl_usd: number | null;
  unrealized_pnl_pct: number | null;
}

export type ScreenerRefreshStatusValue = 'idle' | 'running' | 'completed' | 'error';

// Shared shape for every background-refresh-with-progress feature (Screener
// fundamentals, technical signals, ...) -- the backend's manager modules for
// each all report status in this same shape.
export interface RefreshStatus {
  status: ScreenerRefreshStatusValue;
  total: number | null;
  completed: number;
  skipped: number;
  currentSymbol: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}

// wayfinder ticket 03 (ai-signal-investor-upgrades map): next earnings date for a ticker.
export interface NextEarnings {
  ticker: string;
  next_earnings_date: string | null;
  days_until: number | null;
}

// wayfinder ticket 01/06 (ai-signal-investor-upgrades map): per-ticker pattern lookup.
export interface PatternHistory {
  ticker: string;
  signal_type: string;
  total_matches: number;
  resolved_count: number;
  win_count: number;
  loss_count: number;
  win_rate: number | null; // null when resolved_count < 5 (ticket 01's minimum sample size)
  avg_win_pct: number | null;
  avg_loss_pct: number | null;
  conflict_matches: number | null; // null unless a conflict is currently active
}

// wayfinder ticket 04/09: local-LLM narrative for the AI Technical Signal feature. Wire format
// is snake_case, matching backend/app/schemas.py's AiNarrativeOut (this repo's older API
// convention -- see PriceSignalRow -- rather than RefreshStatus's newer camelCase one).
export interface AiNarrativeResult {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  narrative: string;
  conflicting_signals: string[] | null;
  caveats: string[];
}

// --- Investor Tracker Types (konbalongtun style) ---
export interface InvestorHolding {
  id: string;
  name: string;
  ticker: string;
  portfolio_percent: number;
  avg_buy_price: number;
  current_price: number;
  gain_percent: number;
  activity_period: string;
  activity_text: string;
  sector?: string;
  logo_url?: string;
}

export interface InvestorProfile {
  id: string;
  name: string;
  slug: string;
  fund_name: string;
  performance_1y_pct: number;
  portfolio_value_usd: string;
  portfolio_value_num: number;
  description: string;
  avatar_url: string;
  last_13f_filing: string;
  top_holdings: InvestorHolding[];
}

// Mirrors konbalongtun.com/new-holdings's own response shape (grouped by stock, each
// with a buyers[] list) -- the card-grid UI is built to match that page's real layout.
export interface NewHoldingBuyer {
  investor_slug: string;
  investor_name: string;
  investor_avatar_url: string | null;
  portfolio_percent: number;
  avg_buy_price: number | null;
  gain_percent: number | null;
  activity_period: string;
}

export interface NewHoldingStock {
  ticker: string;
  company_name: string;
  logo_url: string | null;
  current_price: number | null;
  activity_period: string;
  buyers: NewHoldingBuyer[];
  buyers_count: number;
}

export interface NewHoldingsPage {
  items: NewHoldingStock[];
  total_items: number;
  total_pages: number;
  current_page: number;
  limit: number;
}

// --- Macro Dashboard (mirrors the reference /macro page: yield curve panel,
// gold CME card, and five metric-card sections) ---
export interface YieldCurvePoint {
  tenor: string;
  series_id: string;
  yield: number | null;
  prev: number | null;
  change_bps: number | null;
  date: string | null;
  available: boolean;
}

export interface YieldCurve {
  points: YieldCurvePoint[];
  spread_10y2y_bps: number | null;
  inverted: boolean;
}

export interface GoldCme {
  oi: number | null;
  oi_chg: number | null;
  vol: number | null;
  opt_oi: number | null;
  spark: number[];
  available: boolean;
  note: string | null;
}

export interface MacroMetricCard {
  series_id: string;
  name_th: string;
  name_en: string;
  unit: string;
  value: number | null;
  change_val: number | null;
  change_pct: number | null;
  trend: 'up' | 'down' | 'flat';
  recorded_at: string | null;
  available: boolean;
}

export interface MacroSection {
  key: string;
  title_th: string;
  title_en: string;
  items: MacroMetricCard[];
}

export interface MacroDashboard {
  yield_curve: YieldCurve;
  gold_cme: GoldCme;
  sections: MacroSection[];
  updated_at: string;
  data_sources: string[];
}

// --- Profit Models (mirrors the reference /models page: six regime models
// scored 0-100 from live macro data, with conditions + signal maps) ---
export interface ModelCondition {
  name: string;
  logic: string;
  weight: number;
  score: number | null;
}

export interface ModelFactors {
  market_structure: number;
  macro: number;
  news: number;
  confirmation: number;
  risk_penalty: number;
}

export interface ModelResult {
  model_id: string;
  rank: number;
  score: number;
  confidence: number;
  status: string;
  factors: ModelFactors;
  conditions: ModelCondition[];
  available: boolean;
}

export interface SignalMapEntry {
  asset: string;
  category: string;
  direction: string;
  reason: string;
}

export interface ModelMeta {
  model_id: string;
  name_th: string;
  name_en: string;
  short_th: string;
  short_en: string;
  concept_th: string;
  concept_en: string;
  trade_direction: string;
  regime_th: string;
  regime_en: string;
  phase: string;
  color: string;
  signal_map: SignalMapEntry[];
}

export interface ModelHistoryPoint {
  recorded_at: string;
  scores: Record<string, number>;
}

export interface ModelsDashboard {
  models: ModelResult[];
  meta: ModelMeta[];
  factor_caps: Record<string, number>;
  factor_labels_th: Record<string, string>;
  status_meta: Record<string, { en: string; th: string }>;
  thresholds: { building: number; active: number };
  history: ModelHistoryPoint[];
  news_factor_since?: string;
  updated_at: string;
  data_sources: string[];
}

// --- Trading Signals (mirrors the reference /signals trade desk)

export interface SignalCondition {
  key: string;
  max: number;
  pass: boolean;
  score: number;
  value: string;
}

export interface SignalLevels {
  rr: number;
  support: number[];
  resistance: number[];
  sl_basis: string;
  tp_basis: string;
}

export interface SignalTaSnapshot {
  bars: number;
  ta_score: number;
  threshold: number;
  conditions: SignalCondition[];
  indicators: Record<string, unknown>;
  levels: SignalLevels;
}

export interface TradingSignal {
  id: string;
  asset: string;
  category: string;
  direction: string;
  entry_price: number;
  tp: number;
  sl: number;
  current_price: number;
  pnl_pct: number | null;
  signal_strength: number;
  strength_factors: Record<string, number>;
  status: string; // active | tp_hit | sl_hit | expired
  model_id: string | null;
  rationale_th: string | null;
  rationale_en: string | null;
  ta_snapshot: SignalTaSnapshot | null;
  sparkline: number[] | null;
  created_at: string;
  closed_at: string | null;
  expires_at: string | null;
}

export interface SignalStats {
  active_count: number;
  closed_count: number;
  win_count: number;
  loss_count: number;
  win_rate: number | null;
  realized_pnl: number;
  unrealized_pnl: number;
  avg_hold_hours: number | null;
  avg_rr: number | null;
  profit_factor: number | null;
  expectancy: number | null;
  avg_win: number | null;
  avg_loss: number | null;
  payoff_ratio: number | null;
  best_trade: number | null;
  worst_trade: number | null;
  max_drawdown: number | null;
  equity_curve: { t: string; equity: number }[];
}

export interface SignalsDashboard {
  signals: TradingSignal[];
  stats: SignalStats;
  generated_at: string;
  data_sources: string[];
  notes: string[];
}

// --- News (mirrors the reference /news page: RSS headlines enriched with
// Thai titles, impact scores, categories and related-model badges)
export interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  category: string | null;
  impact_score: number | null;
  published_at: string | null;
  title_th: string | null;
  analysis_th: string | null;
  related_models: string[];
}

export interface NewsList {
  items: NewsItem[];
  count: number;
  page: number;
  page_size: number;
  pages: number;
  sources: string[];
  updated_at: string;
}

// --- Banking Stress (mirrors the reference /banking page: bank-run gauge,
// funding rates, deposits, discount window, KRE/^BKX prices, two histories)
export interface BankingFundingCard {
  series_id: string;
  name_th: string | null;
  name_en: string | null;
  unit: string | null;
  value: number | null;
  change_bps: number | null;
  recorded_at: string | null;
  available: boolean;
}

export interface BankingStatCard {
  series_id: string | null;
  value: number | null;
  change_pct: number | null;
  recorded_at: string | null;
  available: boolean;
}

export interface BankingPriceCard {
  price: number | null;
  change_pct: number | null;
}

export interface BankingGauge {
  value: number | null;
  status: string | null;
  zones: { max: number; color: string }[];
  partial_inputs: boolean;
  recorded_at: string | null;
}

export interface BankingHistoryPoint {
  date: string;
  value: number;
}

export interface BankingModel {
  model_id: string;
  score: number | null;
  status: string | null;
  name_th: string | null;
  name_en: string | null;
  concept_th: string | null;
  trade_direction: string | null;
  regime_th: string | null;
  color: string | null;
}

export interface BankingDashboard {
  funding: BankingFundingCard[];
  stat_cards: {
    us_bank_deposits: BankingStatCard | null;
    us_discount_window: BankingStatCard | null;
    kre: BankingPriceCard | null;
    bkx: BankingPriceCard | null;
  };
  gauge: BankingGauge;
  deposit_flow: BankingHistoryPoint[];
  sofr_effr_spread: BankingHistoryPoint[];
  model: BankingModel;
  updated_at: string;
  data_sources: string[];
}

// --- Countries (mirrors the reference /countries page: 27 country cards
// with 10Y yields, computed risk scores, bps-vs-US and 60-day trend)
export interface CountryTrendPoint {
  date: string;
  value: number;
}

export interface CountryComponents {
  yield_level: number | null;
  yield_momentum: number | null;
  fx_depreciation: number | null;
  data_freshness: number | null;
}

export interface CountryCard {
  code: string;
  name_en: string;
  name_th: string;
  currency: string;
  flag: string;
  data_tier: string;
  data_tier_note_th: string;
  yield_value: number | null;
  yield_asof: string | null;
  yield_stale: boolean;
  chg_bp: number | null;
  score: number | null;
  level: string | null;
  components: CountryComponents | null;
  bps_vs_us: number | null;
  trend: CountryTrendPoint[];
}

export interface CountriesDashboard {
  countries: CountryCard[];
  us_10y: number | null;
  updated_at: string;
  data_sources: string[];
}

// --- Country detail (mirrors the reference /countries/:code page)
export interface CountryYieldPoint {
  tenor: string;
  value: number;
}

export interface CountryDetail {
  country: {
    code: string;
    name_en: string;
    name_th: string;
    currency: string;
    flag: string;
    data_tier: string;
    data_tier_note_th: string;
  };
  yield_curve: CountryYieldPoint[];
  yield_asof: string | null;
  yield_stale: boolean;
  risk: {
    score: number | null;
    level: string | null;
    components: CountryComponents | null;
    updated_at: string;
  } | null;
  trend: CountryTrendPoint[];
  us10: number | null;
  bps_vs_us: number | null;
  mini_cards: Array<{
    series_id: string;
    name_th: string;
    unit: string;
    value: number | null;
    change_pct: number | null;
  }>;
}

export interface CountryBrief {
  brief_md: string;
  recommendations: string[];
  scenarios: string[];
  model_used: string;
  generated_at: string;
}

export interface CountryReport {
  report_md: string;
  model_used: string;
  generated_at: string;
}

// --- Forecast / Scenario Simulation (tab จำลองสถานการณ์) -------------------

export interface SimulateFactors {
  market_structure: number;
  macro: number;
  news: number;
  confirmation: number;
  risk_penalty: number;
}

export interface SimulatedModel {
  model_id: string;
  score: number;
  status: 'inactive' | 'building' | 'active';
  confidence: number;
  delta: number;
  factors: SimulateFactors;
}

export interface SliderSpec {
  min: number;
  max: number;
  step: number;
  default: number;
  unit: string;
  label_th: string;
}

export interface SimulateResponse {
  baseline: SimulatedModel[];
  simulated: SimulatedModel[];
  missing_base: string[];
  simulated_at: string;
  slider_specs: Record<string, SliderSpec>;
}

// ── Boardroom (ห้องประชุม AI) ─────────────────────────────────────────────
export interface BoardroomMeeting {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  phase: string;
  current_turn: number;
  turn_plan: string | null;
  agenda: string;
  trigger_type: 'manual' | 'news' | 'model' | 'calendar';
  mode: 'full' | 'short';
  llm_calls: number;
  tokens_in: number;
  tokens_out: number;
  error: string | null;
  created_at: string | null;
  updated_at: string | null;
  ended_at: string | null;
}

export interface BoardroomMessage {
  id: string;
  turn: number;
  phase: string;
  seat_id: string;
  seat_name: string;
  kind: string;
  content_md: string;
  status: string;
  error: string | null;
  tokens_in: number;
  tokens_out: number;
  created_at: string | null;
}

export interface BoardroomClaim {
  id: string;
  seat_id: string;
  phase: string;
  claim_text: string;
  metric: string | null;
  verdict: 'verified' | 'partial' | 'failed' | 'unverifiable';
  sub_reason: string | null;
  reason: string | null;
  checks: string | null;
}

export interface BoardroomSeat {
  seat_id: string;
  position_key: string;
  provider: string;
  model: string;
  name_th: string;
  name_en: string;
  enabled: number;
  sort: number;
}

export interface BoardroomMeetingDetail extends BoardroomMeeting {
  resolution_md: string | null;
  resolution_json: string | null;
  messages: BoardroomMessage[];
  claims: BoardroomClaim[];
  seats: BoardroomSeat[];
}

export interface BoardroomList {
  meetings: BoardroomMeeting[];
}

export interface BoardroomCreateInput {
  agenda: string;
  trigger_type?: 'manual' | 'news' | 'model' | 'calendar';
  mode?: 'full' | 'short';
}

// ── Boardroom Signals (สัญญาณจากที่ประชุม) ─────────────────────────────────
export interface BoardroomStanceCheck {
  k: 'd1' | 'd3' | 'd7';
  correct: boolean | null;
  change_pct: number | null;
  unit: string;
}

export interface BoardroomStance {
  id: string;
  meeting_id: string;
  asset: string;
  price_key: string | null;
  source: string | null;
  unit: 'bp' | 'pct';
  direction: 'long' | 'short';
  price_at: number | null;
  current: number | null;
  pnl: number | null;
  dd: number | null;
  due_at: string | null;
  started_at: string;
  horizon_days: number;
  confidence: number | null;
  consensus: string | null;
  qualified: boolean;
  reason: string | null;
  unit_mismatch: boolean;
  state: 'pending' | 'settled' | 'awaiting' | 'unresolved';
  verdict: 'win' | 'loss' | 'push' | null;
  checks: BoardroomStanceCheck[];
}

export interface BoardroomTrackRow {
  asset: string;
  unit: string;
  wins: number;
  losses: number;
  pushes: number;
  win_pct: number | null;
  avg: number | null;
}

export interface BoardroomStanceStats {
  pending_count: number;
  settled_count: number;
  win_rate: number | null;
  win_rate_display: string | null;
  wins: number;
  losses: number;
  pushes: number;
  n: number;
  cold_start: boolean;
  pnl_live: { pct: number | null; bp: number | null; pct_n: number; bp_n: number };
  pnl_realized: { pct: number | null; bp: number | null; pct_n: number; bp_n: number };
  track_record: BoardroomTrackRow[];
  checks_summary: { k: string; judged: number; pct: number | null; wins: number }[];
}

export interface BoardroomStancesPayload {
  stances: BoardroomStance[];
  stats: BoardroomStanceStats;
}

// ── Trade Desk (ทีมเทรด) ──────────────────────────────────────────────────
export interface TradePositionView {
  market: string;
  side: 'long' | 'short';
  unit: string;   // pct | bp — กลุ่มราคา vs ยีลด์/สเปรด (ป้ายความสด)
  size: number;
  entry_px: number;
  sl_pct: number;
  tp_pct: number;
  status: string;
  realized_pnl: number;
  mark: number | null;      // ราคาปัจจุบัน (P&L สด)
  live_pnl: number | null;  // dir × size × (mark − entry)
}

export interface TradeClosedPosition {
  market: string;
  side: 'long' | 'short';
  entry_px: number;
  close_px: number | null;
  status: string;
  realized_pnl: number;
  closed_at: string | null;
}

export interface TradeTurnView {
  id: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  started_at: string | null;
  lead_decision: Record<string, unknown>;
}

export interface TradeTeamView {
  id: string;
  code: 'A' | 'B';
  name_th: string;
  name_en: string;
  status: string;
  capital: number;
  balance: number;
  equity: number;
  pnl_pct: number;
  margin_used: number;
  mtd_pct: number;
  weekly_target_pct: number;
  monthly_floor_pct: number;
  monthly_stretch_pct: number;
  interval_hours: number;
  next_turn_at: string | null;
  directive_md: string;
  turns_today: number;
  cost_today_usd: number;
  cost_total_usd: number;
  positions: TradePositionView[];
  snapshots: { equity: number; snapped_at: string | null }[];
  closed_positions: TradeClosedPosition[];
  turns: TradeTurnView[];
}

export interface TradeDeskState {
  master_on: boolean;
  per_team_daily_cap: number;
  teams: TradeTeamView[];
  updated_at: string;
}
