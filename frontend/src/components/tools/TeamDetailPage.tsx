import { useCallback, useEffect, useState } from 'react';
import { getTeamDetail, getTeamEquity, setTeamDirective } from '../../api/client';
import type { TeamDetail } from '../../api/types';

const INK = {
  bg: '#0d1220', panel: '#131a2b', panelBorder: '#1e2940', card: '#161e30',
  text: '#e6ecf5', dim: '#8a97ad', faint: '#5a6b85',
  green: '#10b981', red: '#ef4444', amber: '#f59e0b', sky: '#38bdf8', gold: '#f5c542',
};
const NUM: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };
const F = {
  price: (v: number | null) => v != null ? `$${v.toLocaleString('en-US', {minimumFractionDigits:v>=1?2:4,maximumFractionDigits:v>=1?2:4})}` : '—',
  pct: (v: number | null, p = true) => v != null ? `${p&&v>0?'+':''}${v.toFixed(2)}%` : '—',
  num: (v: number | null, d = 2) => v != null ? v.toLocaleString('en-US', {minimumFractionDigits:d,maximumFractionDigits:d}) : '—',
  ago: (iso: string | null) => { if(!iso) return '—'; const m = Math.round((Date.now()-new Date(iso).getTime())/60000); return m<1?'now':m<60?`${m}m`:m<1440?`${Math.round(m/60)}h`:`${Math.round(m/1440)}d`; },
};

interface Props { teamCode: string; onBack: () => void; }

const SEAT_LABELS: Record<string, string> = { trend:'เทรนด์', technical:'เทคนิคอล', macro:'มหภาค', contrarian:'สวนฝูง', news:'ข่าว', quant:'ควอนต์' };
const STAT_CARD = { padding: '6px 8px', borderRadius: 6, background: INK.card, border: `1px solid ${INK.panelBorder}` } as const;

export function TeamDetailPage({ teamCode, onBack }: Props) {
  const [data, setData] = useState<TeamDetail | null>(null);
  const [equity, setEquity] = useState<{date:string;equity:number}[]>([]);
  const [page, setPage] = useState(1);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [dirEdit, setDirEdit] = useState(false);
  const [dirText, setDirText] = useState('');
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async (p: number) => {
    try {
      const [d, e] = await Promise.all([getTeamDetail(teamCode, p), getTeamEquity(teamCode, 30)]);
      setData(d); setEquity(e.points || []);
    } catch {}
    setLoading(false);
  }, [teamCode]);

  useEffect(() => { fetch(page); }, [fetch, page]);

  const saveDirective = async () => { await setTeamDirective(teamCode, dirText); setDirEdit(false); fetch(page); };

  if (loading) return <div style={{padding:40,color:INK.faint,textAlign:'center'}}>⏳</div>;
  if (!data) return <div style={{padding:40,color:INK.red,textAlign:'center'}}>โหลดล้มเหลว</div>;

  const t = data.team;
  const x = (data as any).extended_stats || {};
  const pnlC = (t.pnl_pct??0)>=0?INK.green:INK.red;
  const card = (l: string, v: any, c = INK.text) => (
    <div style={STAT_CARD}><div style={{fontSize:10,color:INK.faint}}>{l}</div><div style={{fontSize:13,fontWeight:700,color:c,...NUM}}>{v}</div></div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:960,margin:'0 auto'}}>
      {/* Back */}
      <button onClick={onBack} style={{alignSelf:'flex-start',background:'none',border:`1px solid ${INK.panelBorder}`,color:INK.dim,borderRadius:8,padding:'5px 12px',cursor:'pointer',fontSize:11}}>← กลับหน้ารวม</button>

      {/* 🚫 Disclaimer — (guard rail ตั๋ว 02 reference-parity) */}
      <div style={{background:INK.amber+'10',border:`1px solid ${INK.amber}33`,borderRadius:8,padding:'6px 12px',display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:16}}>🚫</span>
        <span style={{fontSize:11,color:INK.amber,fontWeight:600}}>พอร์ตจำลอง — ไม่ใช่การเทรดจริง ไม่มีการส่งคำสั่งไปตลาดใดๆ และไม่ใช่คำแนะนำการลงทุน</span>
      </div>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <h2 style={{margin:0,fontSize:20,fontWeight:800,color:INK.text}}>{t.name_th}</h2>
        <span style={{fontSize:11,padding:'2px 8px',borderRadius:999,background:INK.green+'15',color:INK.green,fontWeight:600}}>{t.status} · รุ่น {t.gen}</span>
        <span style={{fontSize:11,color:INK.faint}}>หัวหน้าทีม: {t.lead_model}</span>
        <span style={{fontSize:11,color:INK.faint}}>ลูกทีม ×{Object.keys(t.analyst_prompts).length}</span>
        {t.next_turn_at && <span style={{fontSize:11,color:INK.amber,fontWeight:600,marginLeft:'auto'}}>เทิร์นถัดไป: {F.ago(t.next_turn_at)}</span>}
        <button onClick={()=>fetch(page)} style={{padding:'5px 12px',borderRadius:6,border:`1px solid ${INK.sky}`,background:'transparent',color:INK.sky,fontWeight:600,fontSize:11,cursor:'pointer'}}>⚡ Force Turn</button>
      </div>

      {/* Weekly Target */}
      <div style={{background:INK.panel,border:`1px solid ${INK.panelBorder}`,borderRadius:10,padding:12}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:12,fontWeight:700,color:INK.gold}}>🎯 เป้าสัปดาห์ (หัวหน้าตั้ง)</span>
          {!dirEdit ? (
            <button onClick={()=>{setDirText(t.team_directive||'');setDirEdit(true)}} style={{fontSize:10,color:INK.sky,background:'none',border:'none',cursor:'pointer'}}>แก้ไข</button>
          ) : (
            <div style={{display:'flex',gap:6}}>
              <button onClick={saveDirective} style={{fontSize:10,color:INK.green,background:'none',border:'none',cursor:'pointer'}}>บันทึก</button>
              <button onClick={()=>setDirEdit(false)} style={{fontSize:10,color:INK.faint,background:'none',border:'none',cursor:'pointer'}}>ยกเลิก</button>
            </div>
          )}
        </div>
        {dirEdit ? <textarea value={dirText} onChange={e=>setDirText(e.target.value)} style={{width:'100%',marginTop:8,background:INK.bg,color:INK.text,border:`1px solid ${INK.panelBorder}`,borderRadius:6,padding:6,fontSize:11,resize:'vertical',minHeight:50}} /> :
         t.team_directive ? <div style={{fontSize:11,color:INK.dim,marginTop:6}}>{t.team_directive}</div> :
         <div style={{fontSize:11,color:INK.faint,marginTop:6}}>ยังไม่ได้ตั้งเป้า</div>}
      </div>

      {/* MANDATE */}
      {t.mandate && <div style={{background:INK.amber+'10',border:`1px solid ${INK.amber}33`,borderRadius:8,padding:10}}>
        <div style={{fontSize:11,fontWeight:700,color:INK.amber,marginBottom:4}}>🛤️ ลู่ทีม (MANDATE) — โต๊ะกลางกำหนด ทีมแก้ไม่ได้</div>
        <div style={{fontSize:11,color:INK.dim}}>{t.mandate}</div>
      </div>}

      {/* Stats Cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
        {card('Equity',F.price(t.equity),pnlC)}
        {card('P&L',F.pct(t.pnl_pct),pnlC)}
        {card('Closed P&L',F.price(x.closed_pnl_sum), (x.closed_pnl_sum??0)>=0?INK.green:INK.red)}
        {card('Cash',F.price(t.balance),INK.dim)}
        {card('Margin',F.price(t.margin_used),INK.dim)}
        {card('Live P&L',F.price(x.live_pnl), (x.live_pnl??0)>=0?INK.green:INK.red)}
        {card('Win Rate',x.win_rate!=null?F.pct(x.win_rate,false):'—',INK.sky)}
        {card('R:R',x.rr_ratio!=null?F.num(x.rr_ratio):'—',INK.sky)}
        {card('Avg Win',x.avg_win!=null?F.price(x.avg_win):'—',INK.green)}
        {card('Avg Loss',x.avg_loss!=null?F.price(x.avg_loss):'—',INK.red)}
        {card('Profit Factor',x.profit_factor!=null?F.num(x.profit_factor):'—',INK.sky)}
        {card('Closed',`${x.closed_count??0} ไม้`,INK.dim)}
        {card('Net P&L',F.price(x.net_pnl), (x.net_pnl??0)>=0?INK.green:INK.red)}
        {card('W/L',`W${x.win_count??0}/L${x.loss_count??0}`,INK.dim)}
        {card('Reserve',F.price(x.reserved_margin),INK.faint)}
        {card('Cost',`$${F.num(t.cost_today_usd,4)}`,INK.faint)}
      </div>

      {/* Equity Chart */}
      <Section title={`Equity (${equity.length} วัน)`}>
        {equity.length ? (
          <svg width="100%" height="160" viewBox={`0 0 ${equity.length} 1`} preserveAspectRatio="none" style={{overflow:'visible'}}>
            <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={INK.green} stopOpacity="0.3"/><stop offset="100%" stopColor={INK.green} stopOpacity="0"/></linearGradient></defs>
            {equity.length>1 && (()=>{const vals=equity.map(e=>e.equity);const min=Math.min(...vals),max=Math.max(...vals),r=max-min||1;
              const pts=vals.map((v,i)=>`${(i/(vals.length-1))*equity.length},${1-(v-min)/r}`).join(' ');
              return <><polyline fill="none" stroke={INK.green} strokeWidth="0.03" points={pts}/>
                <polygon points={`0,1 ${pts} ${equity.length},1`} fill="url(#eg)"/></>})()}
          </svg>
        ) : <div style={{fontSize:11,color:INK.faint,padding:20,textAlign:'center'}}>— ยังไม่มีข้อมูล —</div>}
      </Section>

      {/* Open Positions */}
      <Section title={`ไม้ที่เปิดอยู่ (${data.positions.open.length})`}>
        {!data.positions.open.length ? <Empty/> : <Table headers={['Symbol','Side','Entry','Size','SL','TP','P&L']} rows={data.positions.open.map(p=>[
          <b style={{color:INK.text}}>{p.symbol}</b>,
          <span style={{color:p.side==='long'?INK.green:INK.red}}>{p.side}</span>,
          <span style={{color:INK.text,...NUM}}>{F.price(p.entry_price)}</span>,
          <span style={{color:INK.dim,...NUM}}>{F.pct(p.size_pct,false)}</span>,
          p.sl_pct?`${p.sl_pct}%`:'—',
          p.tp_pct?`${p.tp_pct}%`:'—',
          <span style={{color:(p.live_pnl??0)>=0?INK.green:INK.red,fontWeight:700,...NUM}}>{F.pct(p.live_pnl)}</span>,
        ])} />}
      </Section>

      {/* Pending Orders */}
      {data.pending_orders.length>0 && <Section title={`คำสั่งซื้อขาย (${data.pending_orders.length})`}>
        {data.pending_orders.map(o=><div key={o.id} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:`1px solid ${INK.panelBorder}10`,fontSize:11}}>
          <span style={{color:INK.text,fontWeight:600}}>{o.symbol} {o.order_type}</span>
          <span style={{color:INK.dim,...NUM}}>@{F.price(o.target_price)} · ${o.size_notional?.toLocaleString()}</span>
          <span style={{color:o.status==='pending'?INK.amber:INK.faint}}>{o.status}</span>
        </div>)}
      </Section>}

      {/* Constitution */}
      {data.constitutions.length>0 && <Section title="ธรรมนูญทีม">
        {data.constitutions.map(c=><div key={c.id} style={{fontSize:11,color:INK.dim,padding:'6px 0',borderBottom:`1px solid ${INK.panelBorder}10`}}>{c.content.slice(0,300)}{c.created_at&&<span style={{color:INK.faint,marginLeft:8,fontSize:10}}>{F.ago(c.created_at)}</span>}</div>)}
      </Section>}

      {/* Org Chart - 6 Analysts */}
      <Section title={`ผังทีม (${Object.keys(t.analyst_prompts).length} analysts)`}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))',gap:8}}>
          {Object.entries(t.analyst_prompts).map(([seat, prompt]) => (
            <div key={seat} style={{background:INK.card,border:`1px solid ${INK.panelBorder}`,borderRadius:8,padding:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <span style={{fontSize:13,fontWeight:700,color:INK.text}}>{SEAT_LABELS[seat]||seat}</span>
                <span style={{fontSize:10,color:INK.sky,fontWeight:600}}>hit-rate —</span>
              </div>
              <div style={{fontSize:10,color:INK.faint,marginBottom:4}}>{seat} · ตั้งโดยหัวหน้า</div>
              {expandedPrompt === seat ? (
                <pre style={{fontSize:10,color:INK.dim,whiteSpace:'pre-wrap',wordBreak:'break-word',background:INK.bg,border:`1px solid ${INK.panelBorder}`,borderRadius:6,padding:8,maxHeight:180,overflowY:'auto',margin:0}} data-testid={`prompt-full-${seat}`}>{prompt}</pre>
              ) : (
                <div style={{fontSize:10,color:INK.dim,maxHeight:40,overflow:'hidden'}}>{prompt.slice(0,100)}...</div>
              )}
              <button onClick={()=>setExpandedPrompt(expandedPrompt===seat?null:seat)} style={{marginTop:6,fontSize:10,color:INK.sky,background:'none',border:'none',cursor:'pointer',padding:0,fontWeight:600}}>
                {expandedPrompt===seat?'▲ ซ่อน prompt':'▼ ดู prompt เต็ม'}
              </button>
            </div>
          ))}
        </div>
      </Section>

      {/* Meeting History */}
      <Section title={`ประวัติการประชุม (${data.meetings.total})`}>
        {data.meetings.items.map(m=><div key={m.id} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:`1px solid ${INK.panelBorder}10`,fontSize:11}}>
          <span style={{color:INK.text,fontWeight:600}}>{m.consensus}</span>
          <span style={{color:INK.dim}}>{m.analyst_count}/{Object.keys(t.analyst_prompts).length} seats · {m.trigger}</span>
          <span style={{color:INK.faint,...NUM}}>{m.tokens_in?.toLocaleString()}t · ${m.cost_usd?.toFixed(4)}</span>
        </div>)}
        {data.meetings.total>data.meetings.per_page&&<Pagination page={page} total={data.meetings.total} perPage={data.meetings.per_page} onChange={setPage}/>}
      </Section>

      {/* Coach Log */}
      {data.coach_log.length>0 && <Section title="ประวัติการปรับทีม">
        {data.coach_log.map(c=><div key={c.id} style={{fontSize:11,padding:'4px 0',borderBottom:`1px solid ${INK.panelBorder}10`}}>
          <span style={{color:INK.sky,fontWeight:600}}>{SEAT_LABELS[c.analyst_seat]||c.analyst_seat}</span>
          <span style={{color:c.log_type==='coach'?INK.green:INK.amber,margin:'0 6px',fontWeight:600}}>{c.log_type==='coach'?'✓ สั่งโค้ช':'ปรับตัวตน'}</span>
          <span style={{color:INK.dim}}>{c.content.slice(0,120)}</span>
        </div>)}
      </Section>}

      {/* Reviews placeholder */}
      <Section title="รีวิวของทีมนี้">
        <div style={{fontSize:11,color:INK.faint,padding:8}}>— ต้องมีข้อมูลปิดไม้ก่อนถึงจะคำนวณ weekly/monthly scorecard —</div>
      </Section>

      {/* KB */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <Section title={`บทเรียนขาดทุน (${data.knowledge.loss.length})`}>
          {!data.knowledge.loss.length?<Empty/>:data.knowledge.loss.map(k=><div key={k.symbol+k.pnl_pct} style={{fontSize:11,color:INK.red,...NUM,padding:'2px 0'}}>{k.symbol} {k.side} {F.pct(k.pnl_pct)}</div>)}
        </Section>
        <Section title={`เพลย์บุ๊กกำไร (${data.knowledge.profit.length})`}>
          {!data.knowledge.profit.length?<Empty/>:data.knowledge.profit.map(k=><div key={k.symbol+k.pnl_pct} style={{fontSize:11,color:INK.green,...NUM,padding:'2px 0'}}>{k.symbol} {k.side} {F.pct(k.pnl_pct)}</div>)}
        </Section>
      </div>

      {/* Turn cost today */}
      <div style={{fontSize:10,color:INK.faint,textAlign:'right'}}>Token {F.num(t.cost_today_usd,6)} · turns today: {t.turns_today}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{background:INK.panel,border:`1px solid ${INK.panelBorder}`,borderRadius:10,padding:12}}>
    <h4 style={{margin:'0 0 8px',fontSize:12,fontWeight:600,color:INK.dim}}>{title}</h4>{children}</div>;
}
function Empty() { return <div style={{color:INK.faint,fontSize:11,padding:8}}>—</div>; }
function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
    <thead><tr style={{borderBottom:`1px solid ${INK.panelBorder}`}}>{headers.map(h=><th key={h} style={{padding:'4px 6px',textAlign:'left',color:INK.faint,fontWeight:500,fontSize:10}}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r,i)=><tr key={i} style={{borderBottom:`1px solid ${INK.panelBorder}10`}}>{r.map((c,j)=><td key={j} style={{padding:'4px 6px'}}>{c}</td>)}</tr>)}</tbody>
  </table></div>;
}
function Pagination({ page, total, perPage, onChange }: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const max = Math.ceil(total / perPage);
  return <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:8}}>
    <button disabled={page<=1} onClick={()=>onChange(page-1)} style={{padding:'4px 12px',fontSize:11,color:INK.dim,background:INK.card,border:`1px solid ${INK.panelBorder}`,borderRadius:6,cursor:'pointer'}}>←</button>
    <span style={{fontSize:11,color:INK.faint}}>หน้า {page}/{max}</span>
    <button disabled={page>=max} onClick={()=>onChange(page+1)} style={{padding:'4px 12px',fontSize:11,color:INK.dim,background:INK.card,border:`1px solid ${INK.panelBorder}`,borderRadius:6,cursor:'pointer'}}>→</button>
  </div>;
}
