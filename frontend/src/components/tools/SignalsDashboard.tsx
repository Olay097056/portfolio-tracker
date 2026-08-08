import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  closeSignal,
  getSignalsDashboard,
  refreshSignalsDashboard,
} from '../../api/client';
import type { SignalsDashboard as SignalsData, TradingSignal } from '../../api/types';

// Ink palette — same constants as ModelsDashboard (reference site's theme).
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

const CATEGORY_COLORS: Record<string, string> = {
  stocks: 'border-violet-500/30 text-violet-400',
  crypto: 'border-amber-500/30 text-amber-400',
  macro: 'border-sky-500/30 text-sky-400',
  forex: 'border-emerald-500/30 text-emerald-400',
};

const STATUS_STYLES: Record<string, { cls: string; th: string }> = {
  active: { cls: 'bg-sky-500/15 text-sky-400', th: 'ทำงาน' },
  tp_hit: { cls: 'bg-emerald-500/15 text-emerald-400', th: 'TP ถึง' },
  sl_hit: { cls: 'bg-red-500/15 text-red-400', th: 'SL โดน' },
  expired: { cls: 'bg-amber-500/15 text-amber-400', th: 'หมดอายุ' },
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
  if (v === null || v === undefined || v === 0) return '';
  return v > 0 ? 'text-emerald-400' : 'text-red-400';
}

function StatusBadge({ status }: { status: string }) {
  const st = STATUS_STYLES[status] ?? { cls: 'bg-slate-600/20 text-slate-400', th: status };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${st.cls}`}
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
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
        long ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
      }`}
    >
      {long ? '▲ Long' : '▼ Short'}
    </span>
  );
}

function StrengthBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-16 overflow-hidden rounded bg-slate-700/40">
      <div
        className="h-full rounded"
        style={{
          width: `${pct}%`,
          background: pct >= 70 ? INK.up : pct >= 40 ? INK.accent : INK.warn,
        }}
      />
    </div>
  );
}

function Sparkline({ data }: { data: number[] | undefined }) {
  const points = data ?? [];
  if (points.length < 2) {
    return <span className="text-[10px] text-ink-faint">—</span>;
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
    <svg width={w} height={h} className="overflow-visible">
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
    <div className="panel p-4">
      <div className="text-[11px] text-ink-faint">{label}</div>
      <div className={`num mt-1 text-xl font-bold sm:text-2xl ${cls ?? ''}`}>{value}</div>
      {sub ? <div className="num mt-0.5 text-[10px] text-ink-faint">{sub}</div> : null}
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
      <p className="text-xs text-ink-faint">
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          คะแนนเทคนิคอล: <span className="num text-accent">{ta.ta_score}</span>
          <span className="text-ink-faint"> / เกณฑ์ {ta.threshold}</span>
        </div>
        <div className="mt-2 space-y-1">
          {ta.conditions.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-xs">
              <span className={`shrink-0 ${c.pass ? 'text-emerald-400' : 'text-red-400/70'}`}>
                {c.pass ? '✓' : '✗'}
              </span>
              <span className="text-ink-dim">{c.key}</span>
              <span className="num ml-auto text-ink-faint">
                {c.score}/{c.max}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          Indicators
        </div>
        <div className="num mt-2 space-y-1 text-ink-dim">
          <div>RSI14: {fmtNum(ind.rsi14, 1)}</div>
          <div>
            MACD: {fmtNum(ind.macd?.line)} / sig {fmtNum(ind.macd?.signal)}
          </div>
          <div>
            EMA20: {fmtNum(ind.ema20)} · SMA50: {fmtNum(ind.sma50)}
          </div>
          <div>
            Stoch: %K {fmtNum(ind.stoch?.k, 1)} %D {fmtNum(ind.stoch?.d, 1)}
          </div>
          <div>ATR14: {fmtNum(ind.atr14)}</div>
        </div>
      </div>
      <div className="text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          Levels · RR {fmtNum(lv.rr, 1)}
        </div>
        <div className="num mt-2 space-y-1 text-ink-dim">
          <div>
            แนวต้าน: {lv.resistance.length ? lv.resistance.map((r) => fmtNum(r)).join(' · ') : '—'}
          </div>
          <div>
            แนวรับ: {lv.support.length ? lv.support.map((r) => fmtNum(r)).join(' · ') : '—'}
          </div>
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
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="panel h-24 animate-pulse bg-panel-2/40" />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={() => void load()}
          className="mt-3 rounded-lg border border-edge bg-panel px-4 py-2 text-xs text-ink-dim hover:text-ink"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">สัญญาณเทรด</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load(true)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-edge bg-panel px-3 py-2 text-xs font-medium text-ink-dim hover:border-accent/40 hover:text-ink disabled:opacity-50"
          >
            <span className={loading ? 'animate-spin' : ''}>⟳</span>
            สร้างสัญญาณจาก Regime
          </button>
          {data?.generated_at ? (
            <span className="whitespace-nowrap text-[10px] text-ink-faint">
              🕐 ดึงข้อมูลล่าสุด {data.generated_at}
            </span>
          ) : null}
        </div>
      </div>

      {/* Notes */}
      {data?.notes?.length ? (
        <div className="space-y-1">
          {data.notes.map((n) => (
            <p key={n} className="text-[11px] text-ink-faint">
              {n}
            </p>
          ))}
        </div>
      ) : null}

      {/* Stats panel */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
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
          cls={stats?.max_drawdown ? 'text-red-400' : ''}
          sub="จากเส้นทุนสะสม"
        />
      </div>

      {/* Detailed stats */}
      <div className="panel p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink-dim">สถิติละเอียด</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: 'ค่าคาดหวังต่อออเดอร์', value: fmtSigned(stats?.expectancy), cls: pnlCls(stats?.expectancy) },
            { label: 'กำไรเฉลี่ย (ออเดอร์ชนะ)', value: fmtSigned(stats?.avg_win), cls: stats?.avg_win ? 'text-emerald-400' : '' },
            { label: 'ขาดทุนเฉลี่ย (ออเดอร์แพ้)', value: fmtSigned(stats?.avg_loss), cls: stats?.avg_loss ? 'text-red-400' : '' },
            { label: 'Payoff Ratio', value: fmtNum(stats?.payoff_ratio), cls: '' },
            { label: 'ออเดอร์ดีที่สุด', value: fmtSigned(stats?.best_trade), cls: pnlCls(stats?.best_trade) },
            { label: 'ออเดอร์แย่ที่สุด', value: fmtSigned(stats?.worst_trade), cls: pnlCls(stats?.worst_trade) },
            { label: 'ถือเฉลี่ย', value: stats?.avg_hold_hours !== null && stats?.avg_hold_hours !== undefined ? `${fmtNum(stats.avg_hold_hours, 0)}h` : '—' },
            { label: 'R:R เฉลี่ย', value: stats?.avg_rr ? `1:${fmtNum(stats.avg_rr, 1)}` : '—' },
            { label: 'ปิดแล้ว', value: String(stats?.closed_count ?? 0) },
          ].map((it) => (
            <div key={it.label}>
              <div className="text-[10px] text-ink-faint">{it.label}</div>
              <div className={`num mt-0.5 text-sm font-semibold ${it.cls ?? ''}`}>{it.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Category breakdown */}
      {categories.length ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-dim">แยกตามหมวด</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {categories.map((c) => (
              <div key={c.category} className={`panel border-l-2 p-4 ${CATEGORY_COLORS[c.category] ?? ''}`}>
                <div className="text-xs font-bold uppercase">{c.category}</div>
                <div className="num mt-1 text-lg font-bold text-ink">
                  {c.active} <span className="text-xs font-normal text-ink-faint">ทำงาน</span>
                </div>
                <div className="mt-0.5 text-[11px] text-ink-faint">
                  {c.wins}W / {c.losses}L · WR {c.winRate !== null ? `${c.winRate}%` : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full overflow-x-auto rounded-lg border border-edge p-0.5 text-xs">
          {['all', 'macro', 'crypto', 'forex', 'stocks'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium capitalize ${
                category === cat ? 'bg-panel-2 text-ink' : 'text-ink-faint hover:text-ink-dim'
              }`}
            >
              {cat === 'all' ? 'ทั้งหมด' : cat}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs text-ink-faint">
          {SORT_OPTIONS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={`rounded px-2 py-1 ${sortKey === key ? 'bg-panel-2 text-ink' : 'hover:text-ink-dim'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Signal table */}
      {filtered.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-ink-dim">
          {data?.signals.length === 0
            ? 'ยังไม่มีสัญญาณ — สัญญาณจะสร้างอัตโนมัติเมื่อโมเดลใดแตะระดับก่อตัว (≥40) และกราฟผ่านเกณฑ์เทคนิคอล'
            : 'ไม่มีสัญญาณในหมวดนี้'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-edge">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b border-edge text-left text-[10px] uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3">Asset</th>
                <th className="px-3 py-3">Direction</th>
                <th className="px-3 py-3">Entry</th>
                <th className="px-3 py-3">TP</th>
                <th className="px-3 py-3">SL</th>
                <th className="px-3 py-3">Current</th>
                <th className="px-3 py-3">P&L</th>
                <th className="px-3 py-3">Strength</th>
                <th className="px-3 py-3">Chart</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3" />
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
        <div className="panel p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink-dim">
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
  const modelId = signal.model_id;
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-edge/50 last:border-0 hover:bg-panel-2/40"
      >
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-ink-faint transition-transform ${expanded ? 'rotate-180' : ''}`}
            >
              ▾
            </span>
            <span className="num font-semibold">{signal.asset}</span>
          </div>
          <div className="pl-[18px] text-[10px] capitalize text-ink-faint">
            {modelId ?? signal.category} · {fmtDate(signal.created_at)}
          </div>
        </td>
        <td className="px-3 py-2.5">
          <DirectionPill direction={signal.direction} />
        </td>
        <td className="num px-3 py-2.5">{fmtNum(signal.entry_price)}</td>
        <td className="num px-3 py-2.5 text-emerald-400/80">{fmtNum(signal.tp)}</td>
        <td className="num px-3 py-2.5 text-red-400/80">{fmtNum(signal.sl)}</td>
        <td className="px-3 py-2.5">
          <div className="num">{fmtNum(signal.current_price)}</div>
          {signal.status !== 'active' && signal.closed_at ? (
            <div className="text-[9px] text-ink-faint">ปิดเมื่อ {fmtDate(signal.closed_at)}</div>
          ) : null}
        </td>
        <td className={`num px-3 py-2.5 font-semibold ${pnlCls(signal.pnl_pct)}`}>
          {fmtSigned(signal.pnl_pct)}
        </td>
        <td className="px-3 py-2.5">
          <StrengthBar value={signal.signal_strength} />
        </td>
        <td className="px-3 py-2.5">
          <Sparkline data={signal.sparkline ?? undefined} />
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={signal.status} />
        </td>
        <td className="px-3 py-2.5">
          {signal.status === 'active' ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              disabled={closing}
              className="rounded border border-edge px-2 py-1 text-[10px] text-ink-faint hover:border-red-400/40 hover:text-red-400 disabled:opacity-50"
            >
              {closing ? '…' : 'ปิดออเดอร์'}
            </button>
          ) : null}
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-edge/50 bg-panel-2/30">
          <td colSpan={11} className="px-5 py-4">
            <SignalDetail signal={signal} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
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
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ minWidth: 400 }}>
        <line x1={pad} y1={h - pad - ((0 - min) / range) * (h - pad * 2)} x2={w - pad} y2={h - pad - ((0 - min) / range) * (h - pad * 2)} stroke={INK.edge} strokeDasharray="3 3" strokeWidth={1} />
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
