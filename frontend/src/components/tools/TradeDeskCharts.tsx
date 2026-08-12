import { useCallback, useEffect, useState } from 'react';
import { getTeamEquity } from '../../api/client';

const INK = { bg:'#0d1220',panel:'#131a2b',panelBorder:'#1e2940',card:'#161e30',text:'#e6ecf5',dim:'#8a97ad',faint:'#5a6b85',green:'#10b981',red:'#ef4444',amber:'#f59e0b',sky:'#38bdf8',gold:'#f5c542' };

// ── Equity chart (11.4 — ticket 07) ────────────────────────────────────────
// SVG ล้วน ไม่มี dependency (โปรเจคไม่มี recharts — ห้ามเพิ่ม)
// โหมด: % กำไร / $ equity · ช่วง: 24h / 7d / 30d

type EqPoint = { date: string; equity: number };

export function EquityChart({ teamCode }: { teamCode: string }) {
  const [points, setPoints] = useState<EqPoint[] | null>(null);
  const [mode, setMode] = useState<'pct' | 'usd'>('pct');
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('30d');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;
      const r = await getTeamEquity(teamCode, days);
      setPoints(r.points || []);
    } catch { setPoints(null); }
    setLoading(false);
  }, [teamCode, range]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 20, color: INK.faint, textAlign: 'center', fontSize: 11 }}>⏳ กำลังโหลดกราฟ...</div>;
  if (!points || points.length < 2) {
    return (
      <div style={{ padding: 20, color: INK.faint, textAlign: 'center', fontSize: 11 }}>
        ยังไม่มีข้อมูล equity (รอเทิร์นแรก) — <span data-testid="equity-empty">—</span>
      </div>
    );
  }

  // base = จุดแรกของช่วง (เปรียบเทียบกับจุดเริ่มต้นช่วง)
  const base = points[0].equity || 1;
  const vals = mode === 'pct'
    ? points.map(p => ((p.equity - base) / base) * 100)
    : points.map(p => p.equity - base);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;

  const W = 600, H = 160, PAD = 34;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const path = vals.map((v, idx) => `${idx ? 'L' : 'M'}${x(idx).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = vals[vals.length - 1];
  const lastPct = ((points[points.length - 1].equity - base) / base) * 100;
  const color = last >= 0 ? INK.green : INK.red;

  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: INK.text }}>📈 Equity</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['pct', 'usd'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ padding: '2px 10px', borderRadius: 999, border: `1px solid ${mode === m ? INK.sky : INK.panelBorder}`, background: mode === m ? INK.sky + '22' : 'transparent', color: mode === m ? INK.sky : INK.dim, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
              {m === 'pct' ? '% กำไร' : '$ equity'}
            </button>
          ))}
          {(['24h', '7d', '30d'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              style={{ padding: '2px 10px', borderRadius: 999, border: `1px solid ${range === r ? INK.sky : INK.panelBorder}`, background: range === r ? INK.sky + '22' : 'transparent', color: range === r ? INK.sky : INK.dim, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 420 }} data-testid="equity-chart">
        {/* zero line */}
        <line x1={PAD} y1={y(0)} x2={W - PAD} y2={y(0)} stroke={INK.panelBorder} strokeDasharray="3 3" strokeWidth={1} />
        {/* area under curve */}
        <polygon points={`${PAD},${H - PAD} ${path} ${x(vals.length - 1)},${H - PAD}`} fill={color + '14'} stroke="none" />
        <polyline points={path} fill="none" stroke={color} strokeWidth={2} />
        {/* last point */}
        <circle cx={x(vals.length - 1)} cy={y(last)} r={3} fill={color} />
        <text x={PAD} y={14} fill={INK.faint} fontSize={10}>{mode === 'pct' ? `${lastPct >= 0 ? '+' : ''}${lastPct.toFixed(2)}%` : `${last >= 0 ? '+' : ''}$${last.toFixed(2)}`}</text>
        <text x={W - PAD} y={H - 6} fill={INK.faint} fontSize={9} textAnchor="end">{points[0].date?.slice(0, 10) ?? ''} → {points[points.length - 1].date?.slice(0, 10) ?? ''}</text>
      </svg>
    </div>
  );
}

// ── Next-turn countdown (11.6 — ticket 07) ──────────────────────────────────
// next_turn_at มาจาก server เป็น UTC — แปลงเป็นเวลาท้องถิ่นก่อนนับ
// null → "ไม่กำหนด" · เลยเวลา → "ถึงกำหนดแล้ว" (ไม่แสดงเลขติดลบ)

export function NextTurnCountdown({ nextTurnAt }: { nextTurnAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  if (!nextTurnAt) return <span style={{ color: INK.faint, fontSize: 11 }}>เทิร์นถัดไป: —</span>;

  const target = new Date(nextTurnAt).getTime();
  if (Number.isNaN(target)) return <span style={{ color: INK.faint, fontSize: 11 }}>เทิร์นถัดไป: —</span>;

  const diff = target - now;
  if (diff <= 0) return <span style={{ color: INK.green, fontSize: 11, fontWeight: 600 }}>เทิร์นถัดไป: ถึงกำหนดแล้ว</span>;

  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span style={{ color: INK.dim, fontSize: 11 }} data-testid="next-turn-countdown">
      เทิร์นถัดไป: <b style={{ color: INK.text, fontVariantNumeric: 'tabular-nums' }}>{pad(h)}:{pad(m)}:{pad(s)}</b>
    </span>
  );
}
