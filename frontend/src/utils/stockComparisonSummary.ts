// frontend/src/utils/stockComparisonSummary.ts
import type { ComparableStock } from '../api/types';

// Per-section Thai summary lines under the comparison table.
//
// IMPORTANT PROVENANCE NOTE: konbalongtun's /compare page shows summary sentences like
// these, but its API returns NO summary text -- all 97 upstream fields are raw metrics
// (verified 2026-08-08). Their sentences are generated client-side by logic that isn't
// visible from outside, so these rules are NOT a copy of theirs: the thresholds below are
// this codebase's own explicit choices, documented inline. Wording was kept close to the
// reference page's register so the tool reads consistently, but any given verdict here may
// classify a stock differently than konbalongtun would.
//
// Every sentence is built only from values actually present in the data. A missing metric
// contributes no clause at all -- it is never assumed, defaulted, or filled with a guess --
// and a section with nothing measurable returns null so the UI omits the row entirely.

export type ComparisonSection =
  | 'valuation'
  | 'performance'
  | 'growth'
  | 'health'
  | 'ownership'
  | 'technical'
  | 'dividend'
  | 'analyst';

/** Upstream mixes bare numbers with pre-formatted strings ("35.43", "-7.24%", "4,559.02B",
 *  "344.57 -10.35%"). This reads the leading numeric token and ignores any unit/suffix, so
 *  "-7.24%" -> -7.24 and "344.57 -10.35%" -> 344.57. Returns null when there's no number to
 *  read, which is what keeps absent metrics out of the generated sentences entirely. */
export function parseMetricNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const match = String(raw).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function fmt(value: number, decimals = 1): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function joinClauses(lead: string, clauses: string[]): string | null {
  if (clauses.length === 0) return null;
  return `${lead}: ${clauses.join(' ')}`;
}

// --- Thresholds (this codebase's own choices, not konbalongtun's) ---
const PE_CHEAP = 15;
const PE_MODERATE = 25;
const PE_EXPENSIVE = 40;
const PEG_UNDERVALUED = 1;
const PB_HIGH = 5;
const PROFIT_MARGIN_STRONG = 15;
const ROE_EFFICIENT = 15;
const DEBT_EQ_LOW = 0.5;
const DEBT_EQ_HIGH = 2;
const CURRENT_RATIO_HEALTHY = 1.5;
const RSI_OVERSOLD = 30;
const RSI_OVERBOUGHT = 70;
const BETA_VOLATILE = 1.5;
const BETA_DEFENSIVE = 0.8;
const SHORT_FLOAT_ELEVATED = 10;
const PAYOUT_SUSTAINABLE = 60;
const RECOM_BUY = 2.5;
const RECOM_SELL = 3.5;

function valuationSummary(m: Record<string, string | null>): string | null {
  const clauses: string[] = [];
  const pe = parseMetricNumber(m.pe_ratio);
  const peg = parseMetricNumber(m.peg_ratio);
  const pb = parseMetricNumber(m.pb);

  if (pe != null && pe > 0) {
    const band =
      pe < PE_CHEAP ? 'อยู่ในระดับต่ำ' :
      pe < PE_MODERATE ? 'อยู่ในระดับปานกลาง' :
      pe < PE_EXPENSIVE ? 'อยู่ในระดับปานกลางค่อนไปทางสูง' :
      'อยู่ในระดับสูง';
    clauses.push(`ซื้อขายที่ P/E ${fmt(pe)} เท่า ${band}`);
  } else if (pe != null && pe <= 0) {
    // A negative or zero P/E is real information (the company is loss-making), not noise.
    clauses.push('ยังไม่มีค่า P/E ที่ใช้ได้ เนื่องจากผลประกอบการยังขาดทุน');
  }

  if (peg != null && peg > 0) {
    clauses.push(
      peg < PEG_UNDERVALUED
        ? `ค่า PEG ${fmt(peg, 2)} (ต่ำกว่า 1) บ่งชี้ว่าราคายังถูกเมื่อเทียบกับอัตราการเติบโต`
        : `ค่า PEG ${fmt(peg, 2)} สะท้อนว่าราคาสมเหตุสมผลถึงค่อนข้างแพงเมื่อเทียบกับการเติบโต`
    );
  }

  if (pb != null && pb > PB_HIGH) {
    clauses.push(`P/B สูงถึง ${fmt(pb)} เท่า ราคาสูงกว่ามูลค่าสินทรัพย์สุทธิค่อนข้างมาก`);
  }

  return joinClauses('โดยรวมด้านมูลค่า', clauses);
}

function performanceSummary(m: Record<string, string | null>): string | null {
  const clauses: string[] = [];
  const year = parseMetricNumber(m.perf_year);
  const ytd = parseMetricNumber(m.perf_ytd);
  const quarter = parseMetricNumber(m.perf_quarter);

  if (year != null) {
    clauses.push(`ในรอบ 1 ปี ราคา${year >= 0 ? 'ปรับขึ้น' : 'ปรับลง'} ${fmt(Math.abs(year))}%`);
  }
  if (ytd != null) {
    clauses.push(`ตั้งแต่ต้นปี ${ytd >= 0 ? 'บวก' : 'ลบ'} ${fmt(Math.abs(ytd))}%`);
  }
  if (quarter != null) {
    clauses.push(`รอบ 3 เดือนล่าสุด ${quarter >= 0 ? 'ขึ้น' : 'ลง'} ${fmt(Math.abs(quarter))}%`);
  }

  // The lead is chosen from the 1-year figure when present, else the shortest horizon we
  // actually have -- never asserted as "positive" without a number behind it.
  const lead = year ?? ytd ?? quarter;
  const label =
    lead == null ? 'ผลตอบแทนย้อนหลัง' :
    lead >= 0 ? 'แนวโน้มโดยรวมยังเป็นบวก' :
    'แนวโน้มโดยรวมยังติดลบ';

  return joinClauses(label, clauses);
}

function growthSummary(m: Record<string, string | null>): string | null {
  const clauses: string[] = [];
  const salesYy = parseMetricNumber(m.sales_yy_ttm);
  const epsYy = parseMetricNumber(m.eps_yy_ttm);
  const epsNext5y = parseMetricNumber(m.eps_next_5y);

  if (salesYy != null) {
    clauses.push(`รายได้${salesYy >= 0 ? 'เติบโต' : 'หดตัว'} ${fmt(Math.abs(salesYy))}% เทียบปีก่อน`);
  }
  if (epsYy != null) {
    clauses.push(`กำไรต่อหุ้น${epsYy >= 0 ? 'โต' : 'ลดลง'} ${fmt(Math.abs(epsYy))}%`);
  }
  if (epsNext5y != null) {
    clauses.push(`นักวิเคราะห์คาดกำไรจะโตเฉลี่ยราว ${fmt(epsNext5y)}% ต่อปีใน 5 ปีข้างหน้า`);
  }

  const lead = salesYy ?? epsYy;
  const label =
    lead == null ? 'การเติบโต' :
    lead >= 0 ? 'ธุรกิจยังเติบโตได้ดี' :
    'ธุรกิจอยู่ในภาวะหดตัว';

  return joinClauses(label, clauses);
}

function healthSummary(m: Record<string, string | null>): string | null {
  const clauses: string[] = [];
  const profitMargin = parseMetricNumber(m.profit_margin);
  const roe = parseMetricNumber(m.roe);
  const debtEq = parseMetricNumber(m.debt_eq);
  const currentRatio = parseMetricNumber(m.current_ratio);

  if (profitMargin != null) {
    clauses.push(
      profitMargin >= PROFIT_MARGIN_STRONG
        ? `อัตรากำไรสุทธิสูงถึง ${fmt(profitMargin)}% ทำกำไรได้แข็งแกร่ง`
        : profitMargin >= 0
        ? `อัตรากำไรสุทธิ ${fmt(profitMargin)}% อยู่ในระดับปานกลาง`
        : `ยังขาดทุนสุทธิ (อัตรากำไร ${fmt(profitMargin)}%)`
    );
  }
  if (roe != null && roe >= ROE_EFFICIENT) {
    clauses.push(`ROE ${fmt(roe)}% สะท้อนการใช้เงินทุนได้มีประสิทธิภาพ`);
  }
  if (debtEq != null) {
    if (debtEq <= DEBT_EQ_LOW) clauses.push(`หนี้สินต่อทุนต่ำเพียง ${fmt(debtEq, 2)} เท่า ฐานะการเงินมั่นคง`);
    else if (debtEq >= DEBT_EQ_HIGH) clauses.push(`หนี้สินต่อทุนสูงถึง ${fmt(debtEq, 2)} เท่า ควรติดตามภาระหนี้`);
  }
  if (currentRatio != null && currentRatio >= CURRENT_RATIO_HEALTHY) {
    clauses.push(`สภาพคล่องดี (Current Ratio ${fmt(currentRatio, 2)})`);
  }

  const strong = (profitMargin != null && profitMargin >= PROFIT_MARGIN_STRONG) || (roe != null && roe >= ROE_EFFICIENT);
  return joinClauses(strong ? 'สุขภาพการเงินโดยรวมแข็งแรง' : 'สุขภาพทางการเงิน', clauses);
}

function ownershipSummary(m: Record<string, string | null>): string | null {
  const clauses: string[] = [];
  const insiderOwn = parseMetricNumber(m.insider_own);
  const instOwn = parseMetricNumber(m.inst_own);
  const shortFloat = parseMetricNumber(m.short_float);

  if (insiderOwn != null) clauses.push(`ผู้บริหารถือหุ้น ${fmt(insiderOwn)}%`);
  if (instOwn != null) clauses.push(`สถาบัน/กองทุนถือ ${fmt(instOwn)}% ของหุ้นทั้งหมด`);
  if (shortFloat != null) {
    clauses.push(
      shortFloat >= SHORT_FLOAT_ELEVATED
        ? `สัดส่วนการขายชอร์ตค่อนข้างสูง (${fmt(shortFloat)}%)`
        : `สัดส่วนการขายชอร์ตอยู่ในระดับต่ำ (${fmt(shortFloat)}%)`
    );
  }

  return joinClauses('โครงสร้างผู้ถือหุ้น', clauses);
}

function technicalSummary(m: Record<string, string | null>): string | null {
  const clauses: string[] = [];
  const rsi = parseMetricNumber(m.rsi14);
  const sma200 = parseMetricNumber(m.sma200);
  const beta = parseMetricNumber(m.beta);

  if (rsi != null) {
    const zone =
      rsi >= RSI_OVERBOUGHT ? 'เข้าเขตซื้อมากเกินไป (Overbought)' :
      rsi <= RSI_OVERSOLD ? 'เข้าเขตขายมากเกินไป (Oversold)' :
      'อยู่ในโซนปกติ';
    clauses.push(`RSI ${fmt(rsi)} ${zone}`);
  }
  if (sma200 != null) {
    clauses.push(
      sma200 >= 0
        ? `ราคาอยู่เหนือเส้นค่าเฉลี่ย 200 วัน (${fmt(sma200)}%) แนวโน้มระยะยาวยังเป็นขาขึ้น`
        : `ราคาอยู่ต่ำกว่าเส้นค่าเฉลี่ย 200 วัน (${fmt(sma200)}%) แนวโน้มระยะยาวยังเป็นขาลง`
    );
  }
  if (beta != null) {
    if (beta >= BETA_VOLATILE) clauses.push(`ค่า Beta ${fmt(beta, 2)} ราคาผันผวนมากกว่าตลาด`);
    else if (beta > 0 && beta <= BETA_DEFENSIVE) clauses.push(`ค่า Beta ${fmt(beta, 2)} ราคาผันผวนน้อยกว่าตลาด`);
  }

  return joinClauses('สัญญาณทางเทคนิค', clauses);
}

function dividendSummary(m: Record<string, string | null>): string | null {
  const clauses: string[] = [];
  const dividendTtm = parseMetricNumber(m.dividend_ttm);
  const payout = parseMetricNumber(m.payout);
  const growth = parseMetricNumber(m.dividend_gr_35y);

  if (dividendTtm == null || dividendTtm <= 0) {
    // Not paying a dividend is a real, reportable fact -- not a data gap.
    if (m.dividend_ttm != null || m.payout != null) {
      return 'นโยบายปันผล: ยังไม่มีการจ่ายเงินปันผลให้ผู้ถือหุ้นในรอบที่ผ่านมา';
    }
    return null;
  }

  clauses.push('มีการจ่ายเงินปันผลให้ผู้ถือหุ้น');
  if (payout != null) {
    clauses.push(
      payout <= PAYOUT_SUSTAINABLE
        ? `จ่ายจากกำไรราว ${fmt(payout)}% (Payout) ถือว่ายังมีเหลือไปลงทุนต่อ`
        : `จ่ายจากกำไรสูงถึง ${fmt(payout)}% (Payout) เหลือไปลงทุนต่อไม่มาก`
    );
  }
  if (growth != null) {
    clauses.push(`ปันผล${growth >= 0 ? 'เติบโต' : 'ลดลง'}เฉลี่ย ${fmt(Math.abs(growth))}% ต่อปีในช่วงที่ผ่านมา`);
  }

  return joinClauses('นโยบายปันผล', clauses);
}

function analystSummary(stock: ComparableStock): string | null {
  const clauses: string[] = [];
  const recom = parseMetricNumber(stock.metrics.recom);
  const { target_price: targetPrice, analyst_target_upside_pct: upside } = stock;

  if (recom != null) {
    const stance =
      recom <= RECOM_BUY ? 'เชิงบวก' :
      recom >= RECOM_SELL ? 'เชิงลบ' :
      'เป็นกลาง';
    const label = recom <= RECOM_BUY ? '"ซื้อ"' : recom >= RECOM_SELL ? '"ขาย"' : '"ถือ"';
    clauses.push(`นักวิเคราะห์ให้คำแนะนำเฉลี่ย${stance} (${fmt(recom, 2)}/5 ใกล้ ${label})`);
  }
  if (targetPrice != null) {
    const upsideClause =
      upside == null ? '' :
      upside >= 0 ? ` สูงกว่าราคาปัจจุบันราว ${fmt(upside)}% (Upside)` :
      ` ต่ำกว่าราคาปัจจุบันราว ${fmt(Math.abs(upside))}% (Downside)`;
    clauses.push(`ราคาเป้าหมายเฉลี่ย $${fmt(targetPrice, 2)}${upsideClause}`);
  }

  return joinClauses('มุมมองนักวิเคราะห์', clauses);
}

export function buildComparisonSummary(stock: ComparableStock, section: ComparisonSection): string | null {
  const m = stock.metrics;
  switch (section) {
    case 'valuation':
      return valuationSummary(m);
    case 'performance':
      return performanceSummary(m);
    case 'growth':
      return growthSummary(m);
    case 'health':
      return healthSummary(m);
    case 'ownership':
      return ownershipSummary(m);
    case 'technical':
      return technicalSummary(m);
    case 'dividend':
      return dividendSummary(m);
    case 'analyst':
      return analystSummary(stock);
    default:
      return null;
  }
}
