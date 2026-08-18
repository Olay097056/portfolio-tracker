import { useCallback, useEffect, useMemo, useState } from 'react';
import { RiskBanner } from './RiskBanner';
import { getBankingDashboard, refreshBankingDashboard } from '../../api/client';
import type {
  BankingDashboard as BankingDashboardData,
  BankingFundingCard,
  BankingHistoryPoint,
} from '../../api/types';

// Banking Stress tab (วิกฤตแบงก์รัน) — mirrors the reference /banking page:
// bank-run gauge, four funding cards, deposits/discount/KRE/BKX stat cards,
// deposit-flow WoW bar chart, SOFR-EFFR area chart, and the bank-run model
// card. All values come from /api/banking; a missing value renders "—".

const INK = {
  bg: 'var(--bg)',
  panel: 'var(--panel)',
  panelBorder: 'var(--border)',
  text: 'var(--text)',
  textDim: '#c0c8d8',
  inkDim: 'var(--text-muted)',
  inkFaint: 'var(--text-dim)',
  green: '#10b981',
  amber: '#fbbf24',
  red: '#ef4444',
  sky: '#38bdf8',
  gold: '#f5c542',
};

const NUM_STYLE: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  inactive: { label: 'ไม่ทำงาน', bg: 'rgba(71,85,105,0.5)', color: '#94a3b8' },
  building: { label: 'กำลังก่อตัว', bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
  active: { label: 'ทำงาน', bg: 'rgba(16,185,129,0.15)', color: '#34d399' },
  fading: { label: 'อ่อนแรง', bg: 'rgba(249,115,22,0.15)', color: '#fb923c' },
};

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtBps(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} bps`;
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

function statusBadge(status: string | null | undefined) {
  const meta = STATUS_META[status ?? ''] ?? STATUS_META.inactive;
  return (
    <span
      style={{
        borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600,
        background: meta.bg, color: meta.color, whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
}

// ── Gauge: hand-rolled SVG arc with the reference zones ──────────────────
function Gauge({ value, zones }: { value: number | null; zones: { max: number; color: string }[] }) {
  const size = 210;
  const stroke = 16;
  const r = (size - stroke) / 2 - 6;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = -210; // 240° sweep, opening at the bottom
  const sweep = 240;

  const polar = (angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const arcPath = (fromDeg: number, toDeg: number) => {
    const s = polar(fromDeg);
    const e = polar(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  // zone boundaries in degrees across the sweep
  const zoneBands = useMemo(() => {
    const maxVal = zones.length ? zones[zones.length - 1].max : 100;
    let prevMax = 0;
    return zones.map((z) => {
      const from = startAngle + (prevMax / maxVal) * sweep;
      const to = startAngle + (z.max / maxVal) * sweep;
      prevMax = z.max;
      return { ...z, from, to };
    });
  }, [zones, startAngle, sweep]);

  const needleAngle =
    value === null ? null : startAngle + (Math.min(100, Math.max(0, value)) / 100) * sweep;
  const needle = needleAngle === null ? null : polar(needleAngle);

  const zoneColor = (v: number | null) => {
    if (v === null) return INK.inkFaint;
    for (const z of zones) if (v <= z.max) return z.color;
    return zones.length ? zones[zones.length - 1].color : INK.inkFaint;
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Bank-run stress gauge">
      {zoneBands.map((z) => (
        <path key={z.max} d={arcPath(z.from, z.to)} fill="none" stroke={z.color} strokeWidth={stroke} strokeOpacity={0.35} strokeLinecap="butt" />
      ))}
      {needle && (
        <g>
          <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke={zoneColor(value)} strokeWidth={3} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={5} fill={zoneColor(value)} />
        </g>
      )}
      <text x={cx} y={cy - 4} textAnchor="middle" fill={INK.text} fontSize={30} fontWeight={800}>
        {value === null ? '—' : value.toFixed(1)}
      </text>
      <text x={cx} y={cy + 20} textAnchor="middle" fill={INK.inkFaint} fontSize={11}>
        / 100
      </text>
    </svg>
  );
}

// ── Bar chart (deposit-flow WoW %) ────────────────────────────────────────
function BarChart({ points }: { points: BankingHistoryPoint[] }) {
  const W = 600;
  const H = 160;
  const pad = 6;
  if (!points.length) {
    return <div style={{ color: INK.inkFaint, fontSize: 13, padding: '24px 0' }}>ยังไม่มีข้อมูล</div>;
  }
  const values = points.map((p) => p.value);
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const bw = (W - pad * 2) / points.length;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Deposit flow week-over-week">
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke={INK.panelBorder} strokeWidth={1} />
      {points.map((p, i) => {
        const barH = (Math.abs(p.value) / maxAbs) * (H / 2 - 8);
        const y = p.value >= 0 ? H / 2 - barH : H / 2;
        return (
          <rect
            key={i}
            x={pad + i * bw + bw * 0.15}
            y={y}
            width={bw * 0.7}
            height={Math.max(1, barH)}
            fill={p.value >= 0 ? INK.green : INK.red}
            opacity={0.8}
          />
        );
      })}
    </svg>
  );
}

// ── Area chart (SOFR-EFFR spread bps) ────────────────────────────────────
function AreaChart({ points }: { points: BankingHistoryPoint[] }) {
  const W = 600;
  const H = 140;
  if (!points.length) {
    return <div style={{ color: INK.inkFaint, fontSize: 13, padding: '24px 0' }}>ยังไม่มีข้อมูล</div>;
  }
  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / span) * (H - 12) - 6;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="SOFR minus EFFR in basis points">
      <defs>
        <linearGradient id="spreadGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={INK.sky} stopOpacity={0.3} />
          <stop offset="100%" stopColor={INK.sky} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spreadGrad)" />
      <path d={line} fill="none" stroke={INK.sky} strokeWidth={2} />
    </svg>
  );
}

// ── Funding card (SOFR / EFFR / OBFR / spread) ───────────────────────────
function FundingCard({ card }: { card: BankingFundingCard }) {
  const isSpread = card.series_id === 'us_sofr_effr_spread';
  const s = card.value;
  let textColor = INK.text;
  let borderColor = 'transparent';
  if (isSpread && s !== null) {
    if (s > 20) textColor = INK.red;
    else if (s > 10) textColor = INK.amber;
    else textColor = INK.green;
    if (s > 10) borderColor = 'rgba(249,115,22,0.4)';
  }
  return (
    <div style={{ background: INK.panel, border: `1px solid ${borderColor === 'transparent' ? INK.panelBorder : borderColor}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 11, color: INK.inkFaint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {card.name_th || card.name_en}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: card.available ? textColor : INK.inkFaint }}>
        {card.available ? fmt(card.value, card.unit === 'bps' ? 1 : 2) : '—'}
      </div>
      <div style={{ fontSize: 12, color: INK.inkDim }}>
        {card.change_bps !== null && card.change_bps !== undefined ? fmtBps(card.change_bps) : '—'}
        <span style={{ marginLeft: 6, color: INK.inkFaint }}>{fmtDate(card.recorded_at)}</span>
      </div>
    </div>
  );
}

// ── Stat card (deposits / discount window / KRE / BKX) ───────────────────
function StatCard({
  label,
  value,
  change,
  changeLabel,
  digits = 1,
}: {
  label: string;
  value: number | null | undefined;
  change: number | null | undefined;
  changeLabel: string;
  digits?: number;
}) {
  const chgColor = change === null || change === undefined || Number.isNaN(change) ? INK.inkFaint : change >= 0 ? INK.green : INK.red;
  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 11, color: INK.inkFaint }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: value === null || value === undefined ? INK.inkFaint : INK.text }}>
        {fmt(value, digits)}
      </div>
      <div style={{ fontSize: 12, color: chgColor }}>
        {fmtPct(change)}
        <span style={{ marginLeft: 6, color: INK.inkFaint }}>{changeLabel}</span>
      </div>
    </div>
  );
}

// ── Bank-run model card (reuses the models-tab layout) ───────────────────
function ModelCard({ data }: { data: BankingDashboardData }) {
  const m = data.model;
  return (
    <div style={{ background: INK.panel, border: `1px solid ${m.color ?? INK.panelBorder}`, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{m.name_th || 'โมเดลแบงก์รัน'}</span>
        {statusBadge(m.status)}
      </div>
      {m.concept_th && <div style={{ fontSize: 12, color: INK.inkDim }}>{m.concept_th}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 34, fontWeight: 800, color: m.color ?? INK.text }}>{fmt(m.score, 1)}</span>
        <span style={{ fontSize: 12, color: INK.inkFaint }}>/ 100</span>
      </div>
      {m.trade_direction && (
        <div style={{ fontSize: 12, color: INK.inkDim }}>
          <span style={{ color: INK.inkFaint }}>ทิศทาง: </span>
          {m.trade_direction}
        </div>
      )}
      {m.regime_th && (
        <div style={{ fontSize: 12, color: INK.inkDim }}>
          <span style={{ color: INK.inkFaint }}>Regime: </span>
          {m.regime_th}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export function BankingDashboard() {
  const [data, setData] = useState<BankingDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await getBankingDashboard());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000); // refreshMs 300000 like the reference
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await refreshBankingDashboard());
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  if (loading && !data) {
    return <div style={{ color: INK.inkFaint, padding: '40px 0' }}>กำลังโหลดข้อมูลวิกฤตแบงก์รัน…</div>;
  }
  if (error && !data) {
    return (
      <div style={{ padding: '24px 0' }}>
        <div style={{ color: INK.red, marginBottom: 12 }}>โหลดข้อมูลไม่สำเร็จ</div>
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${INK.panelBorder}`, background: INK.panel, color: INK.text, cursor: 'pointer' }}>
          ลองใหม่
        </button>
      </div>
    );
  }
  if (!data) return null;

  const { gauge, funding, stat_cards: stats, deposit_flow, sofr_effr_spread } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 🚫 Risk warning (D13 — ticket 06) */}
      <RiskBanner id="banking" />
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
          วิกฤตแบงก์รัน{' '}
          <span style={{ fontSize: 12, fontWeight: 400, color: INK.inkFaint }}>อัพเดตล่าสุด: {data.updated_at}</span>
        </h3>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${INK.panelBorder}`, background: INK.panel, color: INK.text, cursor: refreshing ? 'wait' : 'pointer', fontSize: 13 }}
        >
          {refreshing ? 'กำลังรีเฟรช…' : '↻ รีเฟรช'}
        </button>
      </div>

      {/* Funding rate cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {funding.map((c) => <FundingCard key={c.series_id} card={c} />)}
      </div>

      {/* Gauge + model card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: INK.inkDim }}>ดัชนีความเสี่ยงแบงก์รัน</h4>
          {gauge.value !== null && gauge.value !== undefined ? (
            <>
              <Gauge value={gauge.value} zones={gauge.zones} />
              {gauge.partial_inputs && (
                <span style={{ borderRadius: 999, border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.1)', padding: '2px 8px', fontSize: 10, color: '#fcd34d' }}>
                  ⚠️ ข้อมูลเข้าไม่ครบ
                </span>
              )}
            </>
          ) : (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: INK.inkFaint }}>
              ยังไม่มีข้อมูลดัชนี
            </div>
          )}
        </div>
        <ModelCard data={data} />
      </div>

      {/* Stat cards: deposits / discount window / KRE / BKX */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="เงินฝากธนาคารรวม" value={stats.us_bank_deposits?.value} change={stats.us_bank_deposits?.change_pct} changeLabel="WoW" />
        <StatCard label="Fed Discount Window" value={stats.us_discount_window?.value} change={stats.us_discount_window?.change_pct} changeLabel="WoW" />
        <StatCard label="KRE (Regional Banks)" value={stats.kre?.price} change={stats.kre?.change_pct} changeLabel="1D" digits={2} />
        <StatCard label="BKX (KBW Banks)" value={stats.bkx?.price} change={stats.bkx?.change_pct} changeLabel="1D" digits={2} />
      </div>

      {/* Two charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 20 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: INK.inkDim }}>กระแสเงินฝาก (WoW %)</h4>
          <BarChart points={deposit_flow} />
        </div>
        <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 20 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: INK.inkDim }}>ความตึงตลาดเงินระยะสั้น — SOFR-EFFR (bps)</h4>
          <AreaChart points={sofr_effr_spread} />
        </div>
      </div>

      {/* Bank stocks table (reference /banking 10-name table) */}
      {(data.bank_stocks?.length ?? 0) > 0 && (
        <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 20 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: INK.inkDim }}>
            หุ้นธนาคารรายตัว <span style={{ color: INK.inkFaint, fontWeight: 400 }}>· ราคา + 1D</span>
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {data.bank_stocks!.map((s) => (
              <div key={s.symbol} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: INK.bg, border: `1px solid ${INK.panelBorder}`, borderRadius: 8, padding: '8px 12px',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: INK.text }}>{s.symbol}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: INK.inkDim, ...NUM_STYLE }}>{s.price?.toFixed(2)}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, ...NUM_STYLE,
                    color: (s.change_pct ?? 0) >= 0 ? INK.green : INK.red,
                  }}>
                    {(s.change_pct ?? 0) >= 0 ? '+' : ''}{s.change_pct?.toFixed(2)}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data sources */}
      <div style={{ fontSize: 11, color: INK.inkFaint, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {data.data_sources.map((s) => (
          <span key={s} style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 999, padding: '2px 8px' }}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
