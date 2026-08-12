import { useCallback, useEffect, useState } from 'react';
import { getTeamDetail } from '../../api/client';
import type { TeamDetail } from '../../api/types';

const INK = {
  bg: '#0d1220', panel: '#131a2b', panelBorder: '#1e2940',
  text: '#e6ecf5', inkDim: '#8a97ad', inkFaint: '#5a6b85',
  green: '#10b981', red: '#ef4444', amber: '#f59e0b', sky: '#38bdf8', gold: '#f5c542',
};
const NUM: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };
const fmtPrice = (v: number | null | undefined) => v != null ? `$${v.toLocaleString('en-US', { minimumFractionDigits: v >= 1 ? 2 : 4, maximumFractionDigits: v >= 1 ? 2 : 4 })}` : '—';
const fmtPct = (v: number | null, plus = true) => v != null ? `${plus && v > 0 ? '+' : ''}${v.toFixed(2)}%` : '—';

interface Props { teamCode?: string; onBack: () => void; }

const SEAT_LABELS: Record<string, string> = {
  trend: 'เทรนด์', technical: 'เทคนิคอล', macro: 'มหภาค',
  contrarian: 'สวนฝูง', news: 'ข่าว', quant: 'ควอนต์',
};

export function TeamDetailPage({ teamCode = 'DEEPSEEK', onBack }: Props) {
  const [data, setData] = useState<TeamDetail | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (p: number) => {
    try { setData(await getTeamDetail(teamCode, p)); } catch {}
    finally { setLoading(false); }
  }, [teamCode]);

  useEffect(() => { fetchData(page); }, [fetchData, page]);

  if (loading) return <div style={{ padding: 40, color: INK.inkFaint, textAlign: 'center' }}>⏳</div>;
  if (!data) return <div style={{ padding: 40, color: INK.red, textAlign: 'center' }}>โหลดข้อมูลล้มเหลว</div>;

  const t = data.team;
  const pnlColor = (t.pnl_pct ?? 0) >= 0 ? INK.green : INK.red;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Back button */}
      <button onClick={onBack}
        style={{ alignSelf: 'flex-start', background: 'none', border: `1px solid ${INK.panelBorder}`,
          color: INK.inkDim, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
        ← กลับหน้ารวม
      </button>

      {/* Header Stats */}
      <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: INK.text }}>{t.name_th}</h2>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#10b98115', color: INK.green, fontWeight: 600 }}>
            {t.status} · รุ่น {t.gen}
          </span>
        </div>
        {t.mandate && <div style={{ fontSize: 11, color: INK.amber, marginBottom: 8 }}>🛤️ {t.mandate}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          {[['Equity', fmtPrice(t.equity), pnlColor], ['P&L', fmtPct(t.pnl_pct), pnlColor],
            ['Closed P&L', fmtPrice(t.closed_pnl), (t.closed_pnl ?? 0) >= 0 ? INK.green : INK.red],
            ['Live P&L', fmtPrice(t.live_pnl), (t.live_pnl ?? 0) >= 0 ? INK.green : INK.red],
            ['Cash', fmtPrice(t.balance), INK.inkDim], ['Margin', fmtPrice(t.margin_used), INK.inkDim],
            ['Turns', `${t.turns_today}`, INK.inkDim], ['Cost', `$${t.cost_today_usd?.toFixed(4)}`, INK.inkDim],
          ].map(([l, v, c]) => (
            <div key={l as string}><div style={{ fontSize: 10, color: INK.inkFaint }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c as string, ...NUM }}>{v}</div></div>
          ))}
        </div>
      </div>

      {/* 6 Analysts (Org Chart) */}
      <Section title={`ผังทีม (${Object.keys(t.analyst_prompts).length} analysts)`} collapsible>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          {Object.entries(t.analyst_prompts).map(([seat, prompt]) => (
            <div key={seat} style={{ background: INK.bg, border: `1px solid ${INK.panelBorder}`, borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK.text, marginBottom: 4 }}>{SEAT_LABELS[seat] || seat}</div>
              <div style={{ fontSize: 10, color: INK.inkFaint }}>{seat} · hit-rate —</div>
              <div style={{ fontSize: 10, color: INK.inkDim, marginTop: 4, maxHeight: 60, overflow: 'hidden' }}>
                {prompt.slice(0, 120)}...
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Open Positions */}
      <Section title={`ไม้ที่เปิดอยู่ (${data.positions.open.length})`} collapsible>
        {!data.positions.open.length ? <Empty>ไม่มีไม้ที่เปิดอยู่</Empty> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ borderBottom: `1px solid ${INK.panelBorder}` }}>
              {['Symbol','Side','Entry','Size','SL','TP','P&L'].map(h => (
                <th key={h} style={{ padding: '4px 6px', textAlign: 'left', color: INK.inkFaint, fontWeight: 500, fontSize: 10 }}>{h}</th>))}
            </tr></thead>
            <tbody>{data.positions.open.map(p => (
              <tr key={p.id} style={{ borderBottom: `1px solid ${INK.panelBorder}10` }}>
                <td style={{ padding: '4px 6px', color: INK.text, fontWeight: 600 }}>{p.symbol}</td>
                <td style={{ padding: '4px 6px', color: p.side === 'long' ? INK.green : INK.red }}>{p.side}</td>
                <td style={{ padding: '4px 6px', color: INK.text, ...NUM }}>{fmtPrice(p.entry_price)}</td>
                <td style={{ padding: '4px 6px', color: INK.inkDim, ...NUM }}>{fmtPct(p.size_pct, false)}</td>
                <td style={{ padding: '4px 6px', color: INK.inkDim }}>{p.sl_pct ? `${p.sl_pct}%` : '—'}</td>
                <td style={{ padding: '4px 6px', color: INK.inkDim }}>{p.tp_pct ? `${p.tp_pct}%` : '—'}</td>
                <td style={{ padding: '4px 6px', color: (p.live_pnl ?? 0) >= 0 ? INK.green : INK.red, fontWeight: 700, ...NUM }}>{fmtPct(p.live_pnl)}</td>
              </tr>))}</tbody>
          </table>
        )}
      </Section>

      {/* Pending Orders */}
      <Section title={`คำสั่งซื้อขาย (${data.pending_orders.length})`} collapsible>
        {!data.pending_orders.length ? <Empty>—</Empty> : data.pending_orders.map(o => (
          <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${INK.panelBorder}10`, fontSize: 11 }}>
            <span style={{ color: INK.text, fontWeight: 600 }}>{o.symbol} {o.order_type}</span>
            <span style={{ color: INK.inkDim, ...NUM }}>@{fmtPrice(o.target_price)} · ${o.size_notional?.toLocaleString()}</span>
            <span style={{ color: o.status === 'pending' ? INK.amber : INK.inkFaint }}>{o.status}</span>
          </div>
        ))}
      </Section>

      {/* Meeting History */}
      <Section title={`ประวัติการประชุม (${data.meetings.total})`} collapsible>
        {data.meetings.items.map(m => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${INK.panelBorder}10`, fontSize: 11 }}>
            <span style={{ color: INK.text, fontWeight: 600 }}>{m.consensus}</span>
            <span style={{ color: INK.inkDim }}>{m.analyst_count} analysts · {m.trigger}</span>
            <span style={{ color: INK.inkFaint, ...NUM }}>{m.tokens_in?.toLocaleString()}t · ${m.cost_usd?.toFixed(4)}</span>
          </div>))}
        {data.meetings.total > data.meetings.per_page && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ padding: '4px 12px', background: INK.panel, border: `1px solid ${INK.panelBorder}`, color: INK.inkDim, borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>←</button>
            <span style={{ color: INK.inkFaint, fontSize: 11 }}>หน้า {page}/{Math.ceil(data.meetings.total / data.meetings.per_page)}</span>
            <button disabled={page >= Math.ceil(data.meetings.total / data.meetings.per_page)} onClick={() => setPage(p => p + 1)}
              style={{ padding: '4px 12px', background: INK.panel, border: `1px solid ${INK.panelBorder}`, color: INK.inkDim, borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>→</button>
          </div>
        )}
      </Section>

      {/* Constitution */}
      {data.constitutions.length > 0 && (
        <Section title="ธรรมนูญทีม" collapsible>
          {data.constitutions.map(c => (
            <div key={c.id} style={{ fontSize: 11, color: INK.inkDim, padding: '6px 0', borderBottom: `1px solid ${INK.panelBorder}10` }}>
              {c.content.slice(0, 200)}
            </div>
          ))}
        </Section>
      )}

      {/* Coach Log */}
      {data.coach_log.length > 0 && (
        <Section title="ประวัติการปรับทีม" collapsible>
          {data.coach_log.map(c => (
            <div key={c.id} style={{ fontSize: 11, padding: '4px 0', borderBottom: `1px solid ${INK.panelBorder}10` }}>
              <span style={{ color: INK.sky, fontWeight: 600 }}>{c.analyst_seat}</span>
              <span style={{ color: INK.inkFaint, margin: '0 6px' }}>{c.log_type}</span>
              <span style={{ color: INK.inkDim }}>{c.content.slice(0, 150)}</span>
            </div>
          ))}
        </Section>
      )}

      {/* KB */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Section title={`บทเรียนขาดทุน (${data.knowledge.loss.length})`}>
          {!data.knowledge.loss.length ? <Empty>—</Empty> :
            data.knowledge.loss.map(k => (
              <div key={k.symbol + k.pnl_pct} style={{ fontSize: 11, color: INK.red, ...NUM, padding: '2px 0' }}>
                {k.symbol} {k.side} {fmtPct(k.pnl_pct)}
              </div>))}
        </Section>
        <Section title={`เพลย์บุ๊กกำไร (${data.knowledge.profit.length})`}>
          {!data.knowledge.profit.length ? <Empty>—</Empty> :
            data.knowledge.profit.map(k => (
              <div key={k.symbol + k.pnl_pct} style={{ fontSize: 11, color: INK.green, ...NUM, padding: '2px 0' }}>
                {k.symbol} {k.side} {fmtPct(k.pnl_pct)}
              </div>))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children, collapsible }: { title: string; children: React.ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 10, padding: 12 }}>
      <div onClick={collapsible ? () => setOpen(o => !o) : undefined}
        style={{ display: 'flex', justifyContent: 'space-between', cursor: collapsible ? 'pointer' : 'default', marginBottom: open ? 8 : 0 }}>
        <h4 style={{ margin: 0, fontSize: 12, fontWeight: 600, color: INK.inkDim }}>{title}</h4>
        {collapsible && <span style={{ color: INK.inkFaint }}>{open ? '▼' : '▶'}</span>}
      </div>
      {open && children}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <div style={{ color: INK.inkFaint, fontSize: 11, padding: 8 }}>{children}</div>;
}
