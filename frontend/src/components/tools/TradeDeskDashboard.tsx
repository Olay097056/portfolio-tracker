import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  getTradeDeskState, runTradeDeskTurn, setTradeDeskSettings,
} from '../../api/client';
import type { TradeDeskState, TradeTeamView } from '../../api/types';

// ── copy ไทย (ticket 01) ───────────────────────────────────────────────────
const T = {
  title: 'ทีมเทรด',
  subtitle: 'ห้องเทรดจำลอง 1 ทีม AI (DeepSeek) — พอร์ตเริ่ม $10,000 ราคาจริง',
  masterOff: 'สวิตช์หลักปิดอยู่ — ทีมจะไม่เปิดเทิร์นเทรด (ราคา/ข้อมูลยังอัปเดต และ SL/TP ของไม้ที่เปิดอยู่ยังทำงานปกติ)',
  masterOn: 'สวิตช์หลักเปิดอยู่ — ทีมเทรดตามรอบ',
  equity: 'Equity',
  capital: 'ทุน',
  balance: 'เงินสด',
  pnl: 'กำไร/ขาดทุน',
  margin: 'มาร์จินที่ใช้',
  mtd: 'MTD',
  weeklyTarget: 'เป้ารายสัปดาห์',
  nextTurn: 'เทิร์นถัดไป',
  turnNow: 'เปิดเทิร์นเลย',
  quota: 'โควตาเทิร์นวันนี้',
  openPos: 'ไม้ที่เปิดอยู่',
  closedPos: 'ไม้ที่ปิดแล้ว',
  cost: 'ต้นทุน LLM',
  turns: 'เทิร์น',
  reasons: 'เหตุผลของหัวหน้า',
  noPos: 'ไม่มีไม้ที่เปิดอยู่',
  noClosed: 'ยังไม่มีไม้ที่ปิดแล้ว',
  noTurns: 'ยังไม่มีเทิร์น',
  strategy: { A: 'สายเทรนด์ · 1–7 วัน · risk 5–10%', B: 'สายกลับค่า · 7–30 วัน · risk 2–5%' },
  disclaimer: 'พอร์ตจำลอง ไม่ใช่การเทรดจริง ไม่มีการส่งคำสั่งไปตลาดใดๆ และไม่ใช่คำแนะนำการลงทุน',
  markets: 'ราคา',
  refresh: 'อัปเดตล่าสุด',
};

// ── palette (INK — ตาม ModelsDashboard) ────────────────────────────────────
const INK = {
  bg: '#0d1117', panel: '#161b22', panel2: '#1c2333', border: '#2d333b',
  text: '#e6edf3', sub: '#8b949e', faint: '#6e7681',
  accent: '#58a6ff', green: '#3fb950', red: '#f85149', amber: '#d29922',
  sky: '#79c0ff', violet: '#bc8cff',
};

const fmtUsd = (n: number | null | undefined, d = 0) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' :
    `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const fmtPct = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' :
    `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;
const pnlColor = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) || Math.abs(n) < 1e-9 ? INK.sub :
    n > 0 ? INK.green : INK.red;

function Panel({ children, title, sub }: { children: ReactNode; title?: string; sub?: string }) {
  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 10, padding: '14px 16px' }}>
      {title && (
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: INK.text }}>{title}</span>
          {sub && <span style={{ fontSize: 12, color: INK.sub, marginLeft: 8 }}>{sub}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

// ── equity chart (SVG วาดเอง — ไม่มี recharts) ──────────────────────────────
function EquityChart({ teams }: { teams: TradeTeamView[] }) {
  // วาดจาก snapshots จริง (ล่าสุด 30 จุดต่อทีม); ไม่มี snapshot → เส้นประ + จุดปัจจุบัน
  const w = 560, h = 120;
  const series = teams.map((t) => ({
    code: t.code,
    color: t.code === 'A' ? INK.sky : INK.violet,
    pts: ((t.snapshots && t.snapshots.length >= 2)
      ? t.snapshots : [{ equity: t.equity, snapped_at: null }])
      .map((s) => s.equity).filter(Number.isFinite),
  })).filter((s) => s.pts.length > 0);
  if (series.length === 0) {
    return <div style={{ color: INK.faint, fontSize: 13, textAlign: 'center', padding: 24 }}>ยังไม่มีข้อมูล equity</div>;
  }
  const all = series.flatMap((s) => s.pts);
  const max = Math.max(...all, 1);
  const min = Math.min(...all, 0);
  const range = max - min || 1;
  const X = (i: number, n: number) => (n === 1 ? w / 2 : (i / (n - 1)) * (w - 24) + 12);
  const Y = (v: number) => h - ((v - min) / range) * (h - 16) - 8;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: 'block' }}>
      {[0, 1, 2].map((i) => {
        const y = h - (h - 16) * (i / 3) - 8;
        return <line key={i} x1={0} x2={w} y1={y} y2={y} stroke={INK.border} strokeWidth={1} />;
      })}
      {series.map((s) => {
        const n = s.pts.length;
        const last = s.pts[n - 1];
        return (
          <g key={s.code}>
            {n >= 2 ? (
              <polyline
                points={s.pts.map((v, i) => `${X(i, n)},${Y(v)}`).join(' ')}
                fill="none" stroke={s.color} strokeWidth={2}
              />
            ) : (
              <line x1={X(0, 1) - 60} x2={X(0, 1) + 60} y1={Y(last)} y2={Y(last)}
                    stroke={s.color} strokeWidth={2} strokeDasharray="4 3" />
            )}
            <circle cx={X(n - 1, n)} cy={Y(last)} r={5} fill={s.color} />
            <text x={X(n - 1, n)} y={Y(last) - 10} textAnchor="middle" fill={s.color} fontSize={11}>
              {s.code} {fmtUsd(last)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── team card ──────────────────────────────────────────────────────────────
function TeamCard({ team, masterOn, cap, onTurn, busy }: {
  team: TradeTeamView; masterOn: boolean; cap: number;
  onTurn: (code: string) => void; busy: boolean;
}) {
  const quotaLeft = Math.max(0, cap - team.turns_today);
  const quotaOut = cap > 0 && team.turns_today >= cap;
  const next = team.next_turn_at ? new Date(team.next_turn_at) : null;
  const nextIn = next ? Math.max(0, next.getTime() - Date.now()) : 0;
  const nextTxt = nextIn <= 0 ? 'ถึงเวลาแล้ว' :
    `${Math.floor(nextIn / 3600000)}ชม. ${Math.floor((nextIn % 3600000) / 60000)}น.`;
  const risk = team.code === 'A'
    ? <span style={{ color: INK.sky, fontSize: 12 }}>เทรนด์ · 1–7 วัน · risk 5–10%</span>
    : <span style={{ color: INK.violet, fontSize: 12 }}>กลับค่า · 7–30 วัน · risk 2–5%</span>;
  const equityColor = pnlColor(team.pnl_pct);

  return (
    <Panel>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 16, color: INK.text }}>{team.name_th}</span>
          {' '}
          <span style={{ color: INK.faint, fontSize: 12 }}>({team.name_en})</span>
          <div style={{ marginTop: 2 }}>{risk}</div>
        </div>
        <span style={{
          fontSize: 12, padding: '2px 8px', borderRadius: 10,
          background: team.status === 'active' ? INK.green + '22' : INK.amber + '22',
          color: team.status === 'active' ? INK.green : INK.amber,
        }}>
          {team.status === 'active' ? 'ทำงาน' : team.status}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: INK.sub }}>{T.equity}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: equityColor }}>{fmtUsd(team.equity)}</div>
          <div style={{ fontSize: 12, color: equityColor }}>{fmtPct(team.pnl_pct)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: INK.sub }}>{T.capital}</div>
          <div style={{ fontSize: 14, color: INK.text }}>{fmtUsd(team.capital)}</div>
          <div style={{ fontSize: 11, color: INK.sub }}>{T.margin}: {fmtUsd(team.margin_used)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: INK.sub }}>{T.balance}</div>
          <div style={{ fontSize: 14, color: INK.text }}>{fmtUsd(team.balance)}</div>
          <div style={{ fontSize: 11, color: INK.sub }}>{T.mtd}: {fmtPct(team.mtd_pct)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: INK.sub }}>{T.weeklyTarget}</div>
          <div style={{ fontSize: 14, color: INK.text }}>{fmtPct(team.weekly_target_pct)}</div>
          <div style={{ fontSize: 11, color: INK.sub }}>{T.quota}: {team.turns_today}/{cap}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: INK.sub }}>
          {T.nextTurn}: <b style={{ color: INK.text }}>{nextTxt}</b> · รอบ {team.interval_hours} ชม.
        </div>
        <div style={{ fontSize: 12, color: INK.sub }}>
          ต้นทุน: <b style={{ color: INK.text }}>${team.cost_total_usd.toFixed(5)}</b> (วันนี้ ${team.cost_today_usd.toFixed(5)})
        </div>
      </div>

      <button
        onClick={() => onTurn(team.code)}
        disabled={!masterOn || quotaOut || busy}
        style={{
          width: '100%', padding: '8px 0', borderRadius: 8, cursor: 'pointer',
          background: INK.accent, color: '#fff', fontWeight: 700, border: 'none',
          opacity: !masterOn || quotaOut || busy ? 0.45 : 1,
        }}
      >
        {!masterOn ? 'สวิตช์หลักปิดอยู่' : quotaOut ? `⏸ หมดโควตาเทิร์น (${team.turns_today}/${cap})` : `▶ ${T.turnNow} (เหลือ ${quotaLeft})`}
      </button>

      {team.positions.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK.text, marginBottom: 6 }}>{T.openPos}</div>
          {team.positions.map((p, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', fontSize: 12,
              padding: '5px 8px', borderRadius: 6, background: INK.panel2, marginBottom: 4,
            }}>
              <span style={{ color: INK.text }}>
                {p.market} <b style={{ color: p.side === 'long' ? INK.green : INK.red }}>{p.side === 'long' ? 'LONG ↑' : 'SHORT ↓'}</b>
                {p.unit === 'bp' && (
                  <span style={{ color: INK.sub, fontSize: 10, marginLeft: 6, border: '1px solid ' + INK.border, borderRadius: 4, padding: '0 4px' }}>ราคารายวัน</span>
                )}
              </span>
              <span style={{ color: INK.sub }}>
                {fmtUsd(p.entry_px, 2)} →{' '}
                <span style={{ color: p.mark != null ? INK.text : INK.sub }}>{p.mark != null ? fmtUsd(p.mark, 2) : '—'}</span>
                {' '}· P&L{' '}
                <b style={{ color: p.live_pnl == null ? INK.sub : (p.live_pnl >= 0 ? INK.green : INK.red) }}>
                  {p.live_pnl != null ? fmtUsd(p.live_pnl, 2) : '—'}
                </b>
                {' '}· SL {p.sl_pct}% / TP {p.tp_pct}%
              </span>
            </div>
          ))}
        </div>
      )}
      {team.positions.length === 0 && (
        <div style={{ fontSize: 12, color: INK.faint, marginTop: 8 }}>{T.noPos}</div>
      )}

      {team.turns.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK.text, marginBottom: 6 }}>
            {T.reasons} (เทิร์นล่าสุด)
          </div>
          {team.turns.slice(0, 3).map((t) => {
            const dec = t.lead_decision as Record<string, unknown>;
            const reason = typeof dec.reason === 'string' ? dec.reason : '';
            const action = String(dec.action ?? '—');
            const market = String(dec.market ?? '—');
            return (
              <div key={t.id} style={{
                fontSize: 12, color: INK.sub, padding: '5px 8px', borderRadius: 6,
                background: INK.panel2, marginBottom: 4,
              }}>
                <b style={{ color: INK.text }}>{action.toUpperCase()} {market}</b>
                {' — '}{reason || '(ไม่มีเหตุผล)'}
                <span style={{ color: INK.faint }}> · {t.tokens_in + t.tokens_out} tok · ${t.cost_usd.toFixed(5)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── main component ─────────────────────────────────────────────────────────
export function TradeDeskDashboard() {
  const [state, setState] = useState<TradeDeskState | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await getTradeDeskState());
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 90_000);
    return () => clearInterval(t);
  }, [load]);

  const toggleMaster = useCallback(async () => {
    if (!state) return;
    await setTradeDeskSettings({ master_on: !state.master_on });
    load();
  }, [state, load]);

  const runTurn = useCallback(async (code: string) => {
    setBusy(true);
    try {
      await runTradeDeskTurn(code);
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  const allPositions = useMemo(() => (state?.teams ?? []).flatMap((t) =>
    t.positions.map((p) => ({ ...p, team: t.code }))), [state]);
  const allClosed = useMemo(() => (state?.teams ?? []).flatMap((t) =>
    t.closed_positions.map((p) => ({ ...p, team: t.code }))), [state]);
  const totalCost = useMemo(() =>
    (state?.teams ?? []).reduce((s, t) => s + t.cost_total_usd, 0), [state]);

  if (!state) {
    return <div style={{ color: INK.sub, padding: 20 }}>{err || 'กำลังโหลด…'}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, color: INK.text }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{T.title}</div>
          <div style={{ fontSize: 13, color: INK.sub, marginTop: 2 }}>{T.subtitle}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: INK.sub }}>ต้นทุน LLM รวม: <b style={{ color: INK.text }}>${totalCost.toFixed(5)}</b></span>
          <button
            onClick={toggleMaster}
            style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 13,
              background: state.master_on ? INK.green + '22' : INK.red + '22',
              color: state.master_on ? INK.green : INK.red,
            }}
          >
            {state.master_on ? '🟢 สวิตช์หลักเปิดอยู่' : '🔴 สวิตช์หลักปิดอยู่'}
          </button>
        </div>
      </div>

      {/* master off banner */}
      {!state.master_on && (
        <div style={{
          background: INK.red + '18', border: `1px solid ${INK.red}55`, borderRadius: 8,
          padding: '10px 14px', fontSize: 13, color: INK.red,
        }}>
          {T.masterOff}
        </div>
      )}

      {/* equity chart */}
      <Panel title="ผลงานการแข่งขั" sub={`${T.refresh}: ${new Date(state.updated_at).toLocaleTimeString('th-TH')}`}>
        <EquityChart teams={state.teams} />
      </Panel>

      {/* team cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 14 }}>
        {state.teams.map((t) => (
          <TeamCard key={t.id} team={t} masterOn={state.master_on} cap={state.per_team_daily_cap}
            onTurn={runTurn} busy={busy} />
        ))}
      </div>

      {/* open positions (all teams) */}
      <Panel title={T.openPos} sub={`${allPositions.length} ไม้`}>
        {allPositions.length === 0 && <div style={{ color: INK.faint, fontSize: 13 }}>{T.noPos}</div>}
        {allPositions.map((p, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', fontSize: 13,
            padding: '6px 10px', borderRadius: 6, background: INK.panel2, marginBottom: 4,
          }}>
            <span style={{ color: INK.text }}>
              <b style={{ color: p.team === 'A' ? INK.sky : INK.violet }}>[{p.team}]</b> {p.market}{' '}
              <b style={{ color: p.side === 'long' ? INK.green : INK.red }}>{p.side === 'long' ? 'LONG ↑' : 'SHORT ↓'}</b>
            </span>
            <span style={{ color: INK.sub }}>
              เข้า {fmtUsd(p.entry_px, 2)} · SL {p.sl_pct}% / TP {p.tp_pct}% · ยังไม่รู้ราคาปัจจุบัน →
              <span style={{ color: INK.faint }}> ดูในทีม</span>
            </span>
          </div>
        ))}
      </Panel>

      {/* closed positions */}
      <Panel title={T.closedPos} sub={`${allClosed.length} ไม้`}>
        {allClosed.length === 0 && <div style={{ color: INK.faint, fontSize: 13 }}>{T.noClosed}</div>}
        {allClosed.map((p, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', fontSize: 13,
            padding: '6px 10px', borderRadius: 6, background: INK.panel2, marginBottom: 4,
          }}>
            <span style={{ color: INK.text }}>
              <b style={{ color: p.team === 'A' ? INK.sky : INK.violet }}>[{p.team}]</b> {p.market}{' '}
              <b style={{ color: p.side === 'long' ? INK.green : INK.red }}>{p.side === 'long' ? 'LONG' : 'SHORT'}</b>{' '}
              <span style={{ fontSize: 11, color: INK.faint }}>{p.status}</span>
            </span>
            <span style={{ color: pnlColor(p.realized_pnl) }}>
              {p.entry_px} → {p.close_px === null ? '—' : fmtUsd(p.close_px, 2)} · P&L {fmtUsd(p.realized_pnl, 2)}
            </span>
          </div>
        ))}
      </Panel>

      {/* disclaimer */}
      <div style={{
        fontSize: 12, color: INK.amber, textAlign: 'center', padding: '10px 0',
        borderTop: `1px solid ${INK.border}`,
      }}>
        🚫 {T.disclaimer}
      </div>
    </div>
  );
}
