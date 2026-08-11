import { useCallback, useEffect, useState } from 'react';
import { getTradeDeskState, triggerTradeDeskTurn, getHyperliquidMarkets } from '../../api/client';
import type { TradeDeskState, HyperliquidMarket } from '../../api/types';

// ── Ink palette (inline style — NO Tailwind) ────────────────────────────────
const INK = {
  bg: '#0d1220',
  panel: '#131a2b',
  panelBorder: '#1e2940',
  text: '#e6ecf5',
  textDim: '#c0c8d8',
  inkDim: '#8a97ad',
  inkFaint: '#5a6b85',
  green: '#10b981',
  red: '#ef4444',
  amber: '#f59e0b',
  sky: '#38bdf8',
  gold: '#f5c542',
};
const NUM: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmtPrice = (v: number | null | undefined) =>
  v != null && Number.isFinite(v) ? `$${v.toLocaleString('en-US', { minimumFractionDigits: v >= 1 ? 2 : 4, maximumFractionDigits: v >= 1 ? 2 : 4 })}` : '—';
const fmtPct = (v: number | null | undefined, plus = true) =>
  v != null && Number.isFinite(v) ? `${plus && v > 0 ? '+' : ''}${v.toFixed(2)}%` : '—';
const fmtNum = (v: number | null | undefined, decimals = 2) =>
  v != null && Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—';

const freshness = (iso: string | null) => {
  if (!iso) return { label: '—', color: INK.inkFaint };
  const min = (Date.now() - new Date(iso).getTime()) / 60000;
  if (min < 5) return { label: 'สด', color: INK.green };
  if (min < 30) return { label: `${Math.round(min)}m`, color: INK.amber };
  return { label: `${Math.round(min / 60)}h`, color: INK.inkFaint };
};

// ── Sub-components ──────────────────────────────────────────────────────────

function TeamCard({ team }: { team: TradeDeskState['teams'][0] }) {
  const pnlColor = (team.pnl_pct ?? 0) >= 0 ? INK.green : INK.red;
  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: INK.text }}>{team.name_th}</h3>
          <span style={{ fontSize: 11, color: INK.inkFaint }}>{team.name_en} · {team.code}</span>
        </div>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#10b98115', color: INK.green, fontWeight: 600 }}>
          {team.status}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          ['Equity', fmtPrice(team.equity), pnlColor],
          ['P&L', `${fmtPct(team.pnl_pct)}`, pnlColor],
          ['Margin', fmtPrice(team.margin_used), INK.inkDim],
          ['Cash', fmtPrice(team.balance), INK.inkDim],
        ].map(([label, value, color]) => (
          <div key={label as string}>
            <div style={{ fontSize: 10, color: INK.inkFaint }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color, ...NUM }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 12, borderTop: `1px solid ${INK.panelBorder}`, paddingTop: 10 }}>
        <span style={{ fontSize: 11, color: INK.inkDim }}>MTD: <b style={{ color: INK.text }}>{fmtPct(team.weekly_target_pct, false)}</b></span>
        <span style={{ fontSize: 11, color: INK.inkDim }}>Turns today: <b style={{ color: INK.text }}>{team.turns_today}</b></span>
        <span style={{ fontSize: 11, color: INK.inkDim }}>Cost: <b style={{ color: INK.text }}>${fmtNum(team.cost_today_usd, 4)}</b></span>
        {team.next_turn_at && (
          <span style={{ fontSize: 11, color: INK.inkDim }}>
            Next: <b style={{ color: freshness(team.next_turn_at).color }}>{freshness(team.next_turn_at).label}</b>
          </span>
        )}
      </div>
    </div>
  );
}

function OpenPositionsTable({ positions }: { positions: TradeDeskState['positions']['open'] }) {
  if (!positions.length) return <p style={{ color: INK.inkFaint, fontSize: 13, padding: 12 }}>ไม่มีไม้ที่เปิดอยู่</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${INK.panelBorder}` }}>
            {['Symbol','Side','Entry','Size','SL','TP','P&L','Age'].map(h => (
              <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: INK.inkFaint, fontWeight: 500, fontSize: 11 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map(p => {
            const pnlColor = (p.live_pnl ?? 0) >= 0 ? INK.green : INK.red;
            const age = p.opened_at ? freshness(p.opened_at).label : '—';
            return (
              <tr key={p.id} style={{ borderBottom: `1px solid ${INK.panelBorder}15` }}>
                <td style={{ padding: '6px 10px', color: INK.text, fontWeight: 600 }}>{p.symbol}</td>
                <td style={{ padding: '6px 10px', color: p.side === 'long' ? INK.green : INK.red, fontWeight: 600 }}>{p.side.toUpperCase()}</td>
                <td style={{ padding: '6px 10px', color: INK.text, ...NUM }}>{fmtPrice(p.entry_price)}</td>
                <td style={{ padding: '6px 10px', color: INK.inkDim, ...NUM }}>{fmtPct(p.size_pct, false)}</td>
                <td style={{ padding: '6px 10px', color: INK.inkDim, ...NUM }}>{p.sl_pct ? `${p.sl_pct}%` : '—'}</td>
                <td style={{ padding: '6px 10px', color: INK.inkDim, ...NUM }}>{p.tp_pct ? `${p.tp_pct}%` : '—'}</td>
                <td style={{ padding: '6px 10px', color: pnlColor, fontWeight: 700, ...NUM }}>{fmtPct(p.live_pnl)}</td>
                <td style={{ padding: '6px 10px', color: INK.inkFaint, fontSize: 11 }}>{age}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TurnHistory({ turns }: { turns: TradeDeskState['turns'] }) {
  if (!turns.length) return <p style={{ color: INK.inkFaint, fontSize: 13, padding: 12 }}>ยังไม่มีประวัติเทิร์น</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {turns.slice(0, 8).map(t => {
        const d = t.lead_decision;
        const consensusColor = t.consensus === 'consensus' ? INK.green : t.consensus === 'dissent' ? INK.amber : INK.inkDim;
        return (
          <div key={t.id} style={{ background: '#0d1220', border: `1px solid ${INK.panelBorder}`, borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: INK.text }}>
                {(d as any)?.action?.toUpperCase?.() || '?'} {(d as any)?.side?.toUpperCase?.() || ''} {(d as any)?.market || ''}
              </span>
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, color: consensusColor, background: `${consensusColor}15`, fontWeight: 600 }}>
                {t.consensus}
              </span>
            </div>
            <div style={{ fontSize: 11, color: INK.inkDim, marginTop: 4 }}>{(d as any)?.rationale || t.agenda}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: INK.inkFaint }}>
              <span>{t.tokens_in}+{t.tokens_out}t</span>
              <span>${fmtNum(t.cost_usd, 4)}</span>
              <span>{freshness(t.started_at).label}</span>
              <span style={{ color: INK.amber }}>{t.trigger}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MarketTable({ markets }: { markets: HyperliquidMarket[] }) {
  const [cat, setCat] = useState<string>('all');
  const filtered = cat === 'all' ? markets : markets.filter(m => m.category === cat);
  const cats = ['all', ...new Set(markets.map(m => m.category))];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {cats.map(c => (
          <button key={c} onClick={() => setCat(c)}
            style={{
              padding: '3px 10px', borderRadius: 999, border: `1px solid ${INK.panelBorder}`,
              background: cat === c ? INK.sky + '20' : 'transparent',
              color: cat === c ? INK.sky : INK.inkDim, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>
            {c.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${INK.panelBorder}`, position: 'sticky', top: 0, background: INK.panel }}>
              {['Symbol','Price','24h','Funding','Vol $M','OI'].map(h => (
                <th key={h} style={{ padding: '4px 8px', textAlign: h === 'Symbol' ? 'left' : 'right', color: INK.inkFaint, fontWeight: 500, fontSize: 10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map(m => (
              <tr key={m.symbol} style={{ borderBottom: `1px solid ${INK.panelBorder}10` }}>
                <td style={{ padding: '4px 8px', color: INK.text, fontWeight: 600 }}>{m.symbol}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: INK.text, ...NUM }}>{fmtPrice(m.mark_price)}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: (m.change_24h_pct ?? 0) >= 0 ? INK.green : INK.red, fontWeight: 600, ...NUM }}>{fmtPct(m.change_24h_pct)}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: INK.inkDim, ...NUM }}>{m.funding_rate != null ? `${m.funding_rate}%` : '—'}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: INK.inkDim, ...NUM }}>{fmtNum(m.volume_24h, 1)}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: INK.inkFaint, ...NUM }}>{fmtNum(m.open_interest, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function TradeDeskDashboard() {
  const [state, setState] = useState<TradeDeskState | null>(null);
  const [markets, setMarkets] = useState<HyperliquidMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [turning, setTurning] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([getTradeDeskState(), getHyperliquidMarkets()]);
      setState(s);
      setMarkets(m.markets || []);
    } catch (e) { setMsg('โหลดข้อมูลล้มเหลว'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const doTurn = async () => {
    setTurning(true); setMsg('');
    try {
      const r = await triggerTradeDeskTurn('DEEPSEEK');
      setMsg(`${(r as any)?.action?.toUpperCase?.() || '?'} ${(r as any)?.side?.toUpperCase?.() || ''} ${(r as any)?.market || ''} — ${(r as any)?.rationale?.slice(0, 80) || ''}`);
      await fetchData();
    } catch (e: any) { setMsg(e?.message || 'เทิร์นล้มเหลว'); }
    finally { setTurning(false); }
  };

  if (loading) return <div style={{ padding: 40, color: INK.inkFaint, textAlign: 'center' }}>⏳ กำลังโหลด...</div>;

  const team = state?.teams?.[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: INK.text }}>🏢 ทีมเทรด</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: INK.inkFaint }}>
            ห้องเทรดจำลอง 1 ทีม AI (DeepSeek) — พอร์ตเริ่ม $10,000 ราคาจริง · Multi-agent: lead + 4 analysts
          </p>
        </div>
        <button onClick={doTurn} disabled={turning}
          style={{
            padding: '8px 18px', borderRadius: 8, border: 'none', cursor: turning ? 'not-allowed' : 'pointer',
            background: INK.sky, color: '#000', fontWeight: 700, fontSize: 13, opacity: turning ? 0.6 : 1,
          }}>
          {turning ? '⏳ กำลังประชุม...' : '⚡ สั่งเทิร์นเอง'}
        </button>
      </div>
      {msg && <div style={{ padding: '8px 12px', borderRadius: 8, background: INK.sky + '15', color: INK.sky, fontSize: 12 }}>{msg}</div>}

      {/* Team Card */}
      {team && <TeamCard team={team} />}

      {/* Open Positions */}
      <Section title="ไม้ที่เปิดอยู่" count={state?.positions?.open?.length}>
        <OpenPositionsTable positions={state?.positions?.open || []} />
      </Section>

      {/* Turn History */}
      <Section title="ประวัติเทิร์น" count={state?.turns?.length}>
        <TurnHistory turns={state?.turns || []} />
      </Section>

      {/* Market Table */}
      <Section title="ตลาดที่เปิดให้เทรด" count={markets.length}>
        <MarketTable markets={markets} />
      </Section>

      {/* Footer */}
      <div style={{ fontSize: 10, color: INK.inkFaint, textAlign: 'right', padding: '8px 0' }}>
        อัปเดตล่าสุด: {state?.updated_at ? new Date(state.updated_at).toLocaleString('th-TH') : '—'}
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 16 }}>
      <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: INK.inkDim }}>
        {title} {count != null && <span style={{ color: INK.inkFaint, fontWeight: 400 }}>({count})</span>}
      </h4>
      {children}
    </div>
  );
}
