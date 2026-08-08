import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  closeSignal,
  getSignalsDashboard,
  refreshSignalsDashboard,
} from '../../api/client';
import type { SignalsDashboard as SignalsData, TradingSignal } from '../../api/types';

// Ink palette — same constants as ModelsDashboard (the app has NO Tailwind,
// so every visual is inline style, matching the reference site's dark theme).
const INK = {
  bg: '#0a0f16',
  panel: '#101623',
  panel2: '#151d2c',
  edge: '#1e2940',
  ink: '#e2e8f0',
  inkDim: '#94a3b8',
  inkFaint: '#5a6b85',
  accent: '#38bdf8',
  up: '#34d399',
  down: '#f87171',
  warn: '#f59e0b',
} as const;

const CATEGORY_BORDERS: Record<string, string> = {
  stocks: '#8b5cf6',
  crypto: '#f59e0b',
  macro: '#38bdf8',
  forex: '#34d399',
};

const STATUS_META: Record<string, { th: string; bg: string; fg: string }> = {
  active: { th: 'ทำงาน', bg: 'rgba(56,189,248,0.15)', fg: '#38bdf8' },
  tp_hit: { th: 'TP ถึง', bg: 'rgba(52,211,153,0.15)', fg: '#34d399' },
  sl_hit: { th: 'SL โดน', bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
  expired: { th: 'หมดอายุ', bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b' },
};

const SORT_OPTIONS: [string, string][] = [
  ['strength', 'Strength'],
  ['pnl', 'P&L'],
  ['date', 'วันที่'],
  ['asset', 'สินทรัพย์'],
];

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtSigned(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const s = v > 0 ? '+' : '';
  return `${s}${v.toFixed(2)}%`;
}

function pnlCls(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return INK.ink;
  return v > 0 ? INK.up : INK.down;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const st = STATUS_META[status] ?? { th: status, bg: 'rgba(71,85,105,0.2)', fg: INK.inkFaint };
  return (
    <span
      style={{
        borderRadius: 4,
        padding: '2px 6px',
        fontSize: 10,
        fontWeight: 600,
        background: st.bg,
        color: st.fg,
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
      }}
      title={status === 'expired' ? 'เกิน 14 วันโดยไม่ชน TP/SL — ปิดที่ราคาปัจจุบัน (P54)' : undefined}
    >
      {status === 'expired' ? `⌛ ${st.th}` : st.th}
    </span>
  );
}

function DirectionPill({ direction }: { direction: string }) {
  const long = direction === 'long';
  return (
    <span
      style={{
        borderRadius: 4,
        padding: '2px 6px',
        fontSize: 10,
        fontWeight: 700,
        background: long ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
        color: long ? INK.up : INK.down,
        whiteSpace: 'nowrap',
      }}
    >
      {long ? '▲ Long' : '▼ Short'}
    </span>
  );
}

function StrengthBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      style={{
        width: 64,
        height: 6,
        borderRadius: 3,
        background: 'rgba(71,85,105,0.4)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 3,
          background: pct >= 70 ? INK.up : pct >= 40 ? INK.accent : INK.warn,
        }}
      />
    </div>
  );
}

function Sparkline({ data }: { data: number[] | undefined }) {
  const points = data ?? [];
  if (points.length < 2) {
    return <span style={{ fontSize: 10, color: INK.inkFaint }}>—</span>;
  }
  const w = 64;
  const h = 20;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / range) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = points[points.length - 1] >= points[0];
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={up ? INK.up : INK.down}
        strokeWidth={1.2}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Stats panel
// ---------------------------------------------------------------------------
function StatCard({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div
      style={{
        background: INK.panel,
        border: `1px solid ${INK.edge}`,
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 11, color: INK.inkFaint }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: cls ?? INK.ink }}>{value}</div>
      {sub ? <div style={{ fontSize: 10, marginTop: 2, color: INK.inkFaint }}>{sub}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signal detail (expanded row)
// ---------------------------------------------------------------------------
function SignalDetail({ signal }: { signal: TradingSignal }) {
  const ta = signal.ta_snapshot;
  if (!ta) {
    return (
      <p style={{ fontSize: 12, color: INK.inkFaint }}>
        {signal.rationale_th ?? 'สัญญาณนำเข้า — ไม่มีข้อมูลเทคนิคอล'}
      </p>
    );
  }
  const ind = ta.indicators as {
    rsi14?: number;
    ema20?: number;
    sma50?: number;
    atr14?: number;
    macd?: { line?: number; signal?: number };
    stoch?: { k?: number; d?: number };
  };
  const lv = ta.levels;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: INK.inkFaint }}>
          คะแนนเทคนิคอล: <span style={{ color: INK.accent }}>{ta.ta_score}</span>
          <span style={{ color: INK.inkFaint }}> / เกณฑ์ {ta.threshold}</span>
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ta.conditions.map((c) => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: c.pass ? INK.up : 'rgba(248,113,113,0.7)' }}>{c.pass ? '✓' : '✗'}</span>
              <span style={{ color: INK.inkDim }}>{c.key}</span>
              <span style={{ marginLeft: 'auto', color: INK.inkFaint }}>
                {c.score}/{c.max}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: INK.inkFaint }}>
          Indicators
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, color: INK.inkDim }}>
          <div>RSI14: {fmtNum(ind.rsi14, 1)}</div>
          <div>MACD: {fmtNum(ind.macd?.line)} / sig {fmtNum(ind.macd?.signal)}</div>
          <div>EMA20: {fmtNum(ind.ema20)} · SMA50: {fmtNum(ind.sma50)}</div>
          <div>Stoch: %K {fmtNum(ind.stoch?.k, 1)} %D {fmtNum(ind.stoch?.d, 1)}</div>
          <div>ATR14: {fmtNum(ind.atr14)}</div>
        </div>
      </div>
      <div style={{ fontSize: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: INK.inkFaint }}>
          Levels · RR {fmtNum(lv.rr, 1)}
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, color: INK.inkDim }}>
          <div>แนวต้าน: {lv.resistance.length ? lv.resistance.map((r) => fmtNum(r)).join(' · ') : '—'}</div>
          <div>แนวรับ: {lv.support.length ? lv.support.map((r) => fmtNum(r)).join(' · ') : '—'}</div>
          <div>SL: {lv.sl_basis === 'swing' ? 'จาก swing level' : 'ATR fallback'}</div>
          <div>TP: {lv.tp_basis === 'level' ? 'จากแนวรับ/ต้าน' : 'RR fallback'}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function SignalsDashboard() {
  const [data, setData] = useState<SignalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('all');
  const [sortKey, setSortKey] = useState('strength');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const d = refresh ? await refreshSignalsDashboard() : await getSignalsDashboard();
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.signals;
    if (category !== 'all') list = list.filter((s) => s.category === category);
    const sorted = [...list];
    switch (sortKey) {
      case 'strength':
        sorted.sort(
          (a, b) =>
            (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) ||
            b.signal_strength - a.signal_strength ||
            b.created_at.localeCompare(a.created_at)
        );
        break;
      case 'pnl':
        sorted.sort(
          (a, b) =>
            (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) ||
            (b.pnl_pct ?? -999) - (a.pnl_pct ?? -999) ||
            b.created_at.localeCompare(a.created_at)
        );
        break;
      case 'asset':
        sorted.sort(
          (a, b) =>
            (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) ||
            a.asset.localeCompare(b.asset) ||
            b.created_at.localeCompare(a.created_at)
        );
        break;
      default:
        sorted.sort(
          (a, b) =>
            (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) ||
            b.created_at.localeCompare(a.created_at)
        );
    }
    return sorted;
  }, [data, category, sortKey]);

  const stats = data?.stats;
  const categories = useMemo(() => {
    if (!data) return [];
    const byCat = new Map<string, { active: number; wins: number; losses: number }>();
    for (const s of data.signals) {
      const c = byCat.get(s.category) ?? { active: 0, wins: 0, losses: 0 };
      if (s.status === 'active') c.active += 1;
      else if ((s.pnl_pct ?? 0) > 0) c.wins += 1;
      else if ((s.pnl_pct ?? 0) < 0) c.losses += 1;
      byCat.set(s.category, c);
    }
    return [...byCat.entries()].map(([cat, c]) => {
      const closed = c.wins + c.losses;
      return {
        category: cat,
        active: c.active,
        wins: c.wins,
        losses: c.losses,
        winRate: closed ? Math.round((c.wins / closed) * 100) : null,
      };
    });
  }, [data]);

  const equity = stats?.equity_curve ?? [];

  const onClose = async (sig: TradingSignal) => {
    setClosingId(sig.id);
    try {
      await closeSignal(sig.id);
      await load();
    } finally {
      setClosingId(null);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 96,
              background: 'rgba(21,29,44,0.4)',
              border: `1px solid ${INK.edge}`,
              borderRadius: 10,
              animation: 'pulse 1.5s infinite',
            }}
          />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        style={{
          background: INK.panel,
          border: `1px solid ${INK.edge}`,
          borderRadius: 10,
          padding: 32,
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 13, color: INK.down }}>{error}</p>
        <button
          onClick={() => void load()}
          style={{
            marginTop: 12,
            borderRadius: 8,
            border: `1px solid ${INK.edge}`,
            background: INK.panel,
            padding: '8px 16px',
            fontSize: 12,
            color: INK.inkDim,
            cursor: 'pointer',
          }}
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: INK.ink }}>สัญญาณเทรด</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => void load(true)}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 8,
              border: `1px solid ${INK.edge}`,
              background: INK.panel,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 500,
              color: INK.inkDim,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            <span style={loading ? { animation: 'spin 1s linear infinite' } : undefined}>⟳</span>
            สร้างสัญญาณจาก Regime
          </button>
          {data?.generated_at ? (
            <span style={{ whiteSpace: 'nowrap', fontSize: 10, color: INK.inkFaint }}>
              🕐 ดึงข้อมูลล่าสุด {data.generated_at}
            </span>
          ) : null}
        </div>
      </div>

      {/* Notes */}
      {data?.notes?.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.notes.map((n) => (
            <p key={n} style={{ margin: 0, fontSize: 11, color: INK.inkFaint }}>
              {n}
            </p>
          ))}
        </div>
      ) : null}

      {/* Stats panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="สัญญาณที่ทำงาน" value={String(stats?.active_count ?? 0)} />
        <StatCard
          label="P&L ลอยตัว"
          value={fmtSigned(stats?.unrealized_pnl)}
          cls={pnlCls(stats?.unrealized_pnl)}
          sub={stats?.active_count ? `เฉลี่ย ${fmtNum(stats.unrealized_pnl / stats.active_count)} · ${stats.active_count}` : undefined}
        />
        <StatCard
          label="P&L ที่ปิดแล้ว"
          value={fmtSigned(stats?.realized_pnl)}
          cls={pnlCls(stats?.realized_pnl)}
          sub={stats?.expectancy !== null && stats?.expectancy !== undefined ? `เฉลี่ย ${fmtNum(stats.expectancy)} · ${stats.closed_count}` : undefined}
        />
        <StatCard
          label="อัตราชนะ"
          value={stats?.win_rate !== null && stats?.win_rate !== undefined ? `${fmtNum(stats.win_rate, 0)}%` : '—'}
          sub={stats?.closed_count ? `${stats.win_count}W / ${stats.loss_count}L` : undefined}
        />
        <StatCard
          label="Profit Factor"
          value={stats?.profit_factor === null || stats?.profit_factor === undefined ? '—' : Number.isFinite(stats.profit_factor) ? fmtNum(stats.profit_factor) : '∞'}
        />
        <StatCard
          label="Drawdown สูงสุด"
          value={stats?.max_drawdown !== null && stats?.max_drawdown !== undefined ? `-${fmtNum(stats.max_drawdown)}` : '—'}
          cls={stats?.max_drawdown ? INK.down : undefined}
          sub="จากเส้นทุนสะสม"
        />
      </div>

      {/* Detailed stats */}
      <div style={{ background: INK.panel, border: `1px solid ${INK.edge}`, borderRadius: 10, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: INK.inkDim }}>สถิติละเอียด</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px 16px' }}>
          {[
            { label: 'ค่าคาดหวังต่อออเดอร์', value: fmtSigned(stats?.expectancy), cls: pnlCls(stats?.expectancy) },
            { label: 'กำไรเฉลี่ย (ออเดอร์ชนะ)', value: fmtSigned(stats?.avg_win), cls: stats?.avg_win ? INK.up : INK.ink },
            { label: 'ขาดทุนเฉลี่ย (ออเดอร์แพ้)', value: fmtSigned(stats?.avg_loss), cls: stats?.avg_loss ? INK.down : INK.ink },
            { label: 'Payoff Ratio', value: fmtNum(stats?.payoff_ratio), cls: INK.ink },
            { label: 'ออเดอร์ดีที่สุด', value: fmtSigned(stats?.best_trade), cls: pnlCls(stats?.best_trade) },
            { label: 'ออเดอร์แย่ที่สุด', value: fmtSigned(stats?.worst_trade), cls: pnlCls(stats?.worst_trade) },
            { label: 'ถือเฉลี่ย', value: stats?.avg_hold_hours !== null && stats?.avg_hold_hours !== undefined ? `${fmtNum(stats.avg_hold_hours, 0)}h` : '—', cls: INK.ink },
            { label: 'R:R เฉลี่ย', value: stats?.avg_rr ? `1:${fmtNum(stats.avg_rr, 1)}` : '—', cls: INK.ink },
            { label: 'ปิดแล้ว', value: String(stats?.closed_count ?? 0), cls: INK.ink },
          ].map((it) => (
            <div key={it.label}>
              <div style={{ fontSize: 10, color: INK.inkFaint }}>{it.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, color: it.cls ?? INK.ink }}>{it.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Category breakdown */}
      {categories.length ? (
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: INK.inkDim }}>แยกตามหมวด</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {categories.map((c) => (
              <div
                key={c.category}
                style={{
                  background: INK.panel,
                  border: `1px solid ${INK.edge}`,
                  borderLeft: `3px solid ${CATEGORY_BORDERS[c.category] ?? INK.inkFaint}`,
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{c.category}</div>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>
                  {c.active} <span style={{ fontSize: 11, fontWeight: 400, color: INK.inkFaint }}>ทำงาน</span>
                </div>
                <div style={{ fontSize: 11, marginTop: 2, color: INK.inkFaint }}>
                  {c.wins}W / {c.losses}L · WR {c.winRate !== null ? `${c.winRate}%` : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', overflowX: 'auto', borderRadius: 8, border: `1px solid ${INK.edge}`, padding: 2, fontSize: 12 }}>
          {['all', 'macro', 'crypto', 'forex', 'stocks'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                whiteSpace: 'nowrap',
                borderRadius: 6,
                padding: '6px 12px',
                fontWeight: 500,
                background: category === cat ? INK.panel2 : 'transparent',
                color: category === cat ? INK.ink : INK.inkFaint,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {cat === 'all' ? 'ทั้งหมด' : cat}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: 12, color: INK.inkFaint }}>
          {SORT_OPTIONS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              style={{
                borderRadius: 6,
                padding: '4px 8px',
                background: sortKey === key ? INK.panel2 : 'transparent',
                color: sortKey === key ? INK.ink : INK.inkFaint,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Signal table */}
      {filtered.length === 0 ? (
        <div
          style={{
            background: INK.panel,
            border: `1px solid ${INK.edge}`,
            borderRadius: 10,
            padding: 40,
            textAlign: 'center',
            fontSize: 13,
            color: INK.inkDim,
          }}
        >
          {data?.signals.length === 0
            ? 'ยังไม่มีสัญญาณ — สัญญาณจะสร้างอัตโนมัติเมื่อโมเดลใดแตะระดับก่อตัว (≥40) และกราฟผ่านเกณฑ์เทคนิคอล'
            : 'ไม่มีสัญญาณในหมวดนี้'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${INK.edge}` }}>
          <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${INK.edge}` }}>
                {['Asset', 'Direction', 'Entry', 'TP', 'SL', 'Current', 'P&L', 'Strength', 'Chart', 'Status', ''].map((h) => (
                  <th
                    key={h || 'action'}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      color: INK.inkFaint,
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const expanded = expandedId === s.id;
                return (
                  <SignalRow
                    key={s.id}
                    signal={s}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : s.id)}
                    closing={closingId === s.id}
                    onClose={() => void onClose(s)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Equity curve */}
      {equity.length >= 2 ? (
        <div style={{ background: INK.panel, border: `1px solid ${INK.edge}`, borderRadius: 10, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: INK.inkDim }}>
            เส้นทุนสะสม (จากออเดอร์ที่ปิดแล้ว)
          </h3>
          <EquityCurve points={equity} />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
function SignalRow({
  signal,
  expanded,
  onToggle,
  closing,
  onClose,
}: {
  signal: TradingSignal;
  expanded: boolean;
  onToggle: () => void;
  closing: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          cursor: 'pointer',
          borderBottom: `1px solid rgba(30,41,64,0.5)`,
          background: expanded ? 'rgba(21,29,44,0.3)' : 'transparent',
        }}
      >
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: INK.inkFaint, transform: expanded ? 'rotate(180deg)' : undefined, display: 'inline-block' }}>
              ▾
            </span>
            <span style={{ fontWeight: 600 }}>{signal.asset}</span>
          </div>
          <div style={{ paddingLeft: 18, fontSize: 10, textTransform: 'capitalize', color: INK.inkFaint }}>
            {signal.model_id ?? signal.category} · {fmtDate(signal.created_at)}
          </div>
        </td>
        <td style={{ padding: '10px 12px' }}>
          <DirectionPill direction={signal.direction} />
        </td>
        <td style={{ padding: '10px 12px' }}>{fmtNum(signal.entry_price)}</td>
        <td style={{ padding: '10px 12px', color: 'rgba(52,211,153,0.8)' }}>{fmtNum(signal.tp)}</td>
        <td style={{ padding: '10px 12px', color: 'rgba(248,113,113,0.8)' }}>{fmtNum(signal.sl)}</td>
        <td style={{ padding: '10px 12px' }}>
          <div>{fmtNum(signal.current_price)}</div>
          {signal.status !== 'active' && signal.closed_at ? (
            <div style={{ fontSize: 9, color: INK.inkFaint }}>ปิดเมื่อ {fmtDate(signal.closed_at)}</div>
          ) : null}
        </td>
        <td style={{ padding: '10px 12px', fontWeight: 600, color: pnlCls(signal.pnl_pct) }}>
          {fmtSigned(signal.pnl_pct)}
        </td>
        <td style={{ padding: '10px 12px' }}>
          <StrengthBar value={signal.signal_strength} />
        </td>
        <td style={{ padding: '10px 12px' }}>
          <Sparkline data={signal.sparkline ?? undefined} />
        </td>
        <td style={{ padding: '10px 12px' }}>
          <StatusBadge status={signal.status} />
        </td>
        <td style={{ padding: '10px 12px' }}>
          {signal.status === 'active' ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              disabled={closing}
              style={{
                borderRadius: 6,
                border: `1px solid ${INK.edge}`,
                padding: '4px 8px',
                fontSize: 10,
                color: INK.inkFaint,
                background: 'transparent',
                cursor: closing ? 'default' : 'pointer',
                opacity: closing ? 0.5 : 1,
              }}
            >
              {closing ? '…' : 'ปิดออเดอร์'}
            </button>
          ) : null}
        </td>
      </tr>
      {expanded ? (
        <tr style={{ background: 'rgba(21,29,44,0.3)' }}>
          <td colSpan={11} style={{ padding: '16px 20px' }}>
            <SignalDetail signal={signal} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
function EquityCurve({ points }: { points: { t: string; equity: number }[] }) {
  const w = 800;
  const h = 180;
  const pad = 8;
  const vals = points.map((p) => p.equity);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.equity - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = vals[vals.length - 1];
  const color = last >= 0 ? INK.up : INK.down;
  const zeroY = h - pad - ((0 - min) / range) * (h - pad * 2);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', minWidth: 400 }}>
        <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke={INK.edge} strokeDasharray="3 3" strokeWidth={1} />
        <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth={2} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={pad + (i / (points.length - 1)) * (w - pad * 2)}
            cy={h - pad - ((p.equity - min) / range) * (h - pad * 2)}
            r={2.5}
            fill={color}
          />
        ))}
      </svg>
    </div>
  );
}
