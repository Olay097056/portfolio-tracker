import { useCallback, useEffect, useState } from 'react';
import { getTradeDeskState, triggerTradeDeskTurn, getStockMarkets, setTeamDirective, setTeamMaster } from '../../api/client';
import type { TradeDeskState, StockMarket, TradePendingOrder, TradeSummary } from '../../api/types';
import { TeamDetailPage } from './TeamDetailPage';
import { EquityChart, NextTurnCountdown } from './TradeDeskCharts';

const INK = { bg:'#0d1220',panel:'#131a2b',panelBorder:'#1e2940',card:'#161e30',text:'#e6ecf5',dim:'#8a97ad',faint:'#5a6b85',green:'#10b981',red:'#ef4444',amber:'#f59e0b',sky:'#38bdf8',gold:'#f5c542' };
const NUM: React.CSSProperties = { fontVariantNumeric:'tabular-nums' };
const F = {
  price:(v:number|null)=>v!=null?`$${v.toLocaleString('en-US',{minimumFractionDigits:v>=1?2:4,maximumFractionDigits:v>=1?2:4})}`:'—',
  pct:(v:number|null,p=true)=>v!=null?`${p&&v>0?'+':''}${v.toFixed(2)}%`:'—',
  num:(v:number|null,d=2)=>v!=null?v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—',
};

export function TradeDeskDashboard() {
  const [state, setState] = useState<TradeDeskState | null>(null);
  const [markets, setMarkets] = useState<StockMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [turning, setTurning] = useState(false);
  const [msg, setMsg] = useState('');
  const [detailTeam, setDetailTeam] = useState<string | null>(null);
  const [mktCat, setMktCat] = useState('all');
  const [directive, setDirective] = useState('');
  const [directiveDraft, setDirectiveDraft] = useState('');
  const [editingDirective, setEditingDirective] = useState(false);
  const [masterOn, setMasterOn] = useState(true);
  const [pendingOrders, setPendingOrders] = useState<TradePendingOrder[]>([]);
  const [summaries, setSummaries] = useState<TradeSummary[]>([]);

  const fetch = useCallback(async () => {
    try { const [s,m] = await Promise.all([getTradeDeskState(), getStockMarkets()]); setState(s); setMarkets(m.markets||[]); setPendingOrders((s as any)?.pending_orders || []); setMasterOn((s as any)?.teams?.[0]?.master_on ?? true); setSummaries((s as any)?.summaries || []); } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { fetch(); }, [fetch]);
  // sync directive from state
  useEffect(() => {
    const d = (state?.teams?.[0] as any)?.team_directive;
    if (typeof d === 'string' && d !== directive) { setDirective(d); setDirectiveDraft(d); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const saveDirective = async () => {
    try { await setTeamDirective('DEEPSEEK', directiveDraft); setDirective(directiveDraft); setEditingDirective(false); setMsg('📌 directive อัปเดตแล้ว'); await fetch(); }
    catch (e: any) { setMsg(e?.message || 'บันทึก failed'); }
  };

  const toggleMaster = async () => {
    const next = !masterOn;
    try { await setTeamMaster('DEEPSEEK', next); setMasterOn(next); setMsg(next ? '🟢 สวิตช์หลักเปิด — ทีมเทิร์นได้' : '🔴 สวิตช์หลักปิด — หยุดเทิร์นใหม่ แต่ SL/TP + settle ยังทำงาน'); await fetch(); }
    catch (e: any) { setMsg(e?.message || 'toggle failed'); }
  };

  const doTurn = async () => { setTurning(true);setMsg(''); try { const r = await triggerTradeDeskTurn('DEEPSEEK'); setMsg(`${(r as any)?.action?.toUpperCase?.()||'?'} ${(r as any)?.market||''} — ${(r as any)?.rationale?.slice(0,80)||''}`); await fetch(); } catch(e:any){ setMsg(e?.message||'fail'); } setTurning(false); };

  if (loading) return <div style={{padding:40,color:INK.faint,textAlign:'center'}}>⏳</div>;
  if (detailTeam) return <TeamDetailPage teamCode={detailTeam} onBack={()=>setDetailTeam(null)} />;

  const team = state?.teams?.[0];
  const openPos = state?.positions?.open || [];
  const turns = state?.turns || [];
  const cats = ['all', ...Array.from(new Set(markets.map(m => m.sector ?? 'อื่นๆ')))];
  const filtered = mktCat==='all'?markets:markets.filter(m=>(m.sector ?? 'อื่นๆ')===mktCat);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <div>
          <h2 style={{margin:0,fontSize:20,fontWeight:800,color:INK.text}}>🏢 ทีมเทรด</h2>
          <p style={{margin:'4px 0 0',fontSize:11,color:INK.faint}}>ห้องเทรดจำลอง 1 ทีม AI (DeepSeek) · พอร์ตเริ่ม $10,000 · หุ้นเงินสด S&P 500 (ราคาจริง yfinance) · ไม่มี leverage/funding/liquidation · Multi-agent: lead + 6 analysts</p>
        </div>
        <button onClick={doTurn} disabled={turning}
          style={{padding:'8px 18px',borderRadius:8,border:'none',cursor:turning?'not-allowed':'pointer',background:INK.sky,color:'#000',fontWeight:700,fontSize:13,opacity:turning?.6:1}}>
          {turning?'⏳':'⚡ สั่งเทิร์นเอง'}
        </button>
      </div>
      {msg && <div style={{padding:'8px 12px',borderRadius:8,background:INK.sky+'15',color:INK.sky,fontSize:12}}>{msg}</div>}

      {/* 🚫 Disclaimer — พอร์ตจำลอง (guard rail ตั๋ว 02 reference-parity) */}
      <div style={{background:INK.amber+'10',border:`1px solid ${INK.amber}33`,borderRadius:8,padding:'8px 14px',display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:16}}>🚫</span>
        <span style={{fontSize:11,color:INK.amber,fontWeight:600}}>
          พอร์ตจำลอง — ไม่ใช่การเทรดจริง ไม่มีการส่งคำสั่งไปตลาดใดๆ และไม่ใช่คำแนะนำการลงทุน
        </span>
      </div>

      {/* Team Card */}
      {team && (
        <div style={{background:INK.panel,border:`1px solid ${INK.panelBorder}`,borderRadius:12,padding:18}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}>
            <div>
              <h3 style={{margin:0,fontSize:16,fontWeight:700,color:INK.text}}>{team.name_th}</h3>
              <span style={{fontSize:10,color:INK.faint}}>{team.name_en} · {team.code}</span>
            </div>
            <span style={{fontSize:11,padding:'2px 8px',borderRadius:999,background:INK.green+'15',color:INK.green,fontWeight:600,marginLeft:'auto'}}>{team.status}</span>
            {/* Master switch (11.5) */}
            <button onClick={toggleMaster} title="สวิตช์หลัก — ปิด = หยุดเทิร์นใหม่ แต่ SL/TP + settle ยังทำงาน"
              style={{display:'flex',alignItems:'center',gap:6,padding:'3px 10px',borderRadius:999,border:`1px solid ${masterOn?INK.green:INK.red}55`,background:masterOn?INK.green+'15':'transparent',color:masterOn?INK.green:INK.red,fontWeight:700,fontSize:11,cursor:'pointer'}} data-testid="master-toggle">
              <span style={{width:8,height:8,borderRadius:999,background:masterOn?INK.green:INK.red,display:'inline-block'}}/>
              {masterOn ? 'เปิด' : 'ปิด'}
            </button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
            {[[F.price(team.equity),'Equity',(team.pnl_pct??0)>=0?INK.green:INK.red],[F.pct(team.pnl_pct),'P&L',(team.pnl_pct??0)>=0?INK.green:INK.red],[F.price(team.margin_used),'Reserved',INK.dim],[F.price(team.balance),'Cash',INK.dim]].map(([v,l,c],i)=><div key={i}><div style={{fontSize:10,color:INK.faint}}>{l as string}</div><div style={{fontSize:15,fontWeight:700,color:c as string,...NUM}}>{v as string}</div></div>)}
          </div>
          <div style={{display:'flex',gap:14,marginTop:10,borderTop:`1px solid ${INK.panelBorder}`,paddingTop:10,flexWrap:'wrap',alignItems:'center'}}>
            <span style={{fontSize:11,color:INK.dim}}>MTD: <b style={{color:INK.text}}>{(team as any).mtd_pnl_pct != null ? F.pct((team as any).mtd_pnl_pct, false) : '—'}</b> / 5–20%</span>
            <span style={{fontSize:11,color:INK.dim}}>เป้าสัปดาห์นี้: <b style={{color:INK.text}}>{F.pct(team.weekly_target_pct,false)}</b></span>
            <span style={{fontSize:11,color:INK.dim}}>เทิร์นวันนี้: <b style={{color:INK.text}}>{team.turns_today}</b>/4</span>
            <NextTurnCountdown nextTurnAt={(team as any).next_turn_at ?? null} />
            <span style={{fontSize:11,color:INK.dim}}>Cost: <b style={{color:INK.text}}>${F.num(team.cost_today_usd,4)}</b></span>
            <button onClick={()=>setDetailTeam(team.code)} style={{padding:'4px 14px',borderRadius:999,border:`1px solid ${INK.sky}`,background:'transparent',color:INK.sky,fontWeight:600,fontSize:11,cursor:'pointer',marginLeft:'auto'}}>ดูรายละเอียดทีม →</button>
          </div>
        </div>
      )}

      {/* Equity chart (11.4) */}
      {team && <EquityChart teamCode={team.code} />}

      {/* Directive editor (11.9) */}
      {team && (
        <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: INK.text }}>📌 คำสั่งโต๊ะกลาง (directive)</span>
            {!editingDirective && (
              <button onClick={() => { setDirectiveDraft(directive); setEditingDirective(true); }}
                style={{ padding: '2px 12px', borderRadius: 999, border: `1px solid ${INK.sky}`, background: 'transparent', color: INK.sky, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                {directive ? 'แก้ไข' : 'ตั้งคำสั่ง'}
              </button>
            )}
          </div>
          {editingDirective ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea value={directiveDraft} onChange={(e) => setDirectiveDraft(e.target.value)}
                placeholder='เช่น "งดเทรดตอนข่าว FOMC — รอหลังประกาศ 30 นาที"'
                rows={2}
                style={{ background: INK.bg, border: `1px solid ${INK.panelBorder}`, borderRadius: 8, color: INK.text, fontSize: 12, padding: '8px 10px', fontFamily: 'inherit', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveDirective} style={{ padding: '4px 14px', borderRadius: 8, border: 'none', background: INK.sky, color: '#000', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>บันทึก</button>
                <button onClick={() => { setDirectiveDraft(directive); setEditingDirective(false); }} style={{ padding: '4px 14px', borderRadius: 8, border: `1px solid ${INK.panelBorder}`, background: 'transparent', color: INK.dim, fontSize: 11, cursor: 'pointer' }}>ยกเลิก</button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: directive ? INK.text : INK.faint, lineHeight: 1.5 }} data-testid="directive-text">
              {directive || 'ยังไม่มีคำสั่ง — AI ตัดสินใจเองจากข้อมูล'}{' '}
              {directive && <span style={{ color: INK.sky, fontWeight: 600 }}>📌 AI จะเห็นคำสั่งนี้ทุกเทิร์น</span>}
            </div>
          )}
        </div>
      )}

      {/* Summaries (11.8 — AI สรุปประจำวัน/เดือน + เป้ารายสัปดาห์) */}
      {summaries.length > 0 && (
        <Section title={`สรุปโดย AI (${summaries.length})`}>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {summaries.map((s,i)=>(
              <div key={i} style={{background:INK.card,border:`1px solid ${INK.panelBorder}`,borderRadius:8,padding:'8px 12px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4,flexWrap:'wrap',gap:6}}>
                  <span style={{fontSize:10,fontWeight:700,color:s.kind==='weekly_target'?INK.sky:s.kind==='monthly'?INK.gold:INK.dim,textTransform:'uppercase',letterSpacing:0.5}}>
                    {s.kind==='weekly_target'?'🎯 เป้ารายสัปดาห์':s.kind==='monthly'?'📅 สรุปรายเดือน':'📋 สรุปประจำวัน'} · {s.period}
                  </span>
                  {s.cost_usd>0 && <span style={{fontSize:9,color:INK.faint}}>${F.num(s.cost_usd,5)} · {s.tokens_in}+{s.tokens_out} tok</span>}
                </div>
                <div style={{fontSize:11,color:INK.dim,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{s.summary_th}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Pending orders (11.7) */}
      <Section title={`ออเดอร์ที่ตั้งไว้ (${pendingOrders.filter(o=>o.status==='pending').length} รอเข้า)`}>
        {!pendingOrders.length ? <Empty/> : (
          <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead><tr style={{borderBottom:`1px solid ${INK.panelBorder}`}}>{['Symbol','Side','Type','Target','Size','SL/TP','Status','หมดอายุ'].map(h=><th key={h} style={{padding:'4px 6px',textAlign:'left',color:INK.faint,fontWeight:500,fontSize:10}}>{h}</th>)}</tr></thead>
            <tbody>{pendingOrders.map(o=>{
              const st = o.status==='pending' ? {t:'⏳ รอเข้า',c:INK.amber} : o.status==='filled' ? {t:'✓ เข้าแล้ว',c:INK.green} : {t:'✕ ยกเลิก/หมดอายุ',c:INK.red};
              return <tr key={o.id} style={{borderBottom:`1px solid ${INK.panelBorder}10`}}>
                <td style={{padding:'4px 6px',color:INK.text,fontWeight:600}}>{o.symbol}</td>
                <td style={{padding:'4px 6px',color:o.side==='long'?INK.green:INK.red,fontWeight:600}}>{o.side.toUpperCase()}</td>
                <td style={{padding:'4px 6px',color:INK.dim,fontWeight:600}}>{o.order_type}</td>
                <td style={{padding:'4px 6px',color:INK.text,...NUM}}>{F.price(o.target_price)}</td>
                <td style={{padding:'4px 6px',color:INK.dim,...NUM}}>${F.num(o.size_notional,0)}</td>
                <td style={{padding:'4px 6px',color:INK.dim}}>{o.sl_price?`SL ${o.sl_price}%`:''}{o.sl_price&&o.tp_price?' / ':''}{o.tp_price?`TP ${o.tp_price}%`:''}</td>
                <td style={{padding:'4px 6px',color:st.c,fontWeight:700}}>{st.t}</td>
                <td style={{padding:'4px 6px',color:INK.faint}}>{o.expires_at?new Date(o.expires_at).toLocaleDateString():'—'}</td>
              </tr>;
            })}</tbody>
          </table></div>
        )}
      </Section>

      {/* Open Positions All Teams */}
      <Section title={`ไม้ที่เปิดอยู่ (${openPos.length})`}>
        {!openPos.length ? <Empty/> : <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
          <thead><tr style={{borderBottom:`1px solid ${INK.panelBorder}`}}>{['Symbol','Side','Entry','Qty','Cost','SL','TP','P&L'].map(h=><th key={h} style={{padding:'4px 6px',textAlign:'left',color:INK.faint,fontWeight:500,fontSize:10}}>{h}</th>)}</tr></thead>
          <tbody>{openPos.map(p=><tr key={p.id} style={{borderBottom:`1px solid ${INK.panelBorder}10`}}>
            <td style={{padding:'4px 6px',color:INK.text,fontWeight:600}}>{p.symbol}</td>
            <td style={{padding:'4px 6px',color:p.side==='long'?INK.green:INK.red,fontWeight:600}}>{p.side.toUpperCase()}</td>
            <td style={{padding:'4px 6px',color:INK.text,...NUM}}>{F.price(p.entry_price)}</td>
            <td style={{padding:'4px 6px',color:INK.dim,...NUM}}>{p.quantity!=null?F.num(p.quantity,2):'—'}</td>
            <td style={{padding:'4px 6px',color:INK.dim,...NUM}}>{p.reserved_cash!=null?F.price(p.reserved_cash):'—'}</td>
            <td style={{padding:'4px 6px',color:INK.dim}}>{p.sl_pct?`${p.sl_pct}%`:'—'}</td>
            <td style={{padding:'4px 6px',color:INK.dim}}>{p.tp_pct?`${p.tp_pct}%`:'—'}</td>
            <td style={{padding:'4px 6px',color:(p.live_pnl??0)>=0?INK.green:INK.red,fontWeight:700,...NUM}}>{F.price(p.live_pnl)}</td>
          </tr>)}</tbody>
        </table></div>}
      </Section>

      {/* Turn History */}
      <Section title={`ประวัติเทิร์น (${turns.length})`}>
        {!turns.length?<Empty/>:turns.slice(0,8).map(t=>{const d=t.lead_decision as any; const cc=t.consensus==='consensus'?INK.green:t.consensus==='dissent'?INK.amber:INK.dim;
          return <div key={t.id} style={{background:INK.card,border:`1px solid ${INK.panelBorder}`,borderRadius:8,padding:'6px 10px',marginBottom:6}}>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <span style={{fontSize:12,fontWeight:600,color:INK.text}}>{(d?.action||'?').toUpperCase()} {(d?.side||'').toUpperCase()} {d?.market||''}</span>
              <span style={{fontSize:10,padding:'1px 6px',borderRadius:999,color:cc,background:`${cc}15`,fontWeight:600}}>{t.consensus}</span>
            </div>
            <div style={{fontSize:10,color:INK.dim,marginTop:2}}>{d?.rationale||t.agenda}</div>
            <div style={{display:'flex',gap:10,marginTop:3,fontSize:10,color:INK.faint}}>
              <span>{t.tokens_in}+{t.tokens_out}t</span><span>${F.num(t.cost_usd,4)}</span><span>{t.trigger}</span>
            </div>
          </div>;
        })}
      </Section>

      {/* Market Table with TA/TIER */}
      <Section title={`ตลาดที่เปิดให้เทรด (${filtered.length}/${markets.length})`}>
        <div style={{display:'flex',gap:6,marginBottom:8}}>{cats.map(c=><button key={c} onClick={()=>setMktCat(c)} style={{padding:'3px 10px',borderRadius:999,border:`1px solid ${INK.panelBorder}`,background:mktCat===c?INK.sky+'20':'transparent',color:mktCat===c?INK.sky:INK.dim,fontSize:10,fontWeight:600,cursor:'pointer',textTransform:'uppercase'}}>{c}</button>)}</div>
        <div style={{overflowX:'auto',maxHeight:400,overflowY:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:10}}>
          <thead><tr style={{borderBottom:`1px solid ${INK.panelBorder}`,position:'sticky',top:0,background:INK.panel}}>
            {['Symbol','Price','24h','Sector','Vol $B','TA','TIER'].map(h=><th key={h} style={{padding:'3px 6px',textAlign:h==='Symbol'?'left':'right',color:INK.faint,fontWeight:500,fontSize:9}}>{h}</th>)}
          </tr></thead>
          <tbody>{filtered.slice(0,120).map(m=>{
            const ta = (m as any).ta_signals || [];
            const arrow = (m as any).ta_arrow || '·';
            const tier = (m as any).tier || 3;
            const tierColor = tier===1?INK.gold:tier===2?INK.sky:INK.faint;
            return <tr key={m.symbol} style={{borderBottom:`1px solid ${INK.panelBorder}10`}}>
              <td style={{padding:'3px 6px',color:INK.text,fontWeight:600}}>{m.symbol}</td>
              <td style={{padding:'3px 6px',textAlign:'right',color:INK.text,...NUM}}>{F.price(m.price)}</td>
              <td style={{padding:'3px 6px',textAlign:'right',color:(m.change_24h_pct??0)>=0?INK.green:INK.red,fontWeight:600,...NUM}}>{F.pct(m.change_24h_pct)}</td>
              <td style={{padding:'3px 6px',textAlign:'right',color:INK.dim,fontSize:9}}>{m.sector ?? '—'}</td>
              <td style={{padding:'3px 6px',textAlign:'right',color:INK.dim,...NUM}}>{m.dollar_volume!=null?`$${F.num(m.dollar_volume/1e9,2)}B`:'—'}</td>
              <td style={{padding:'3px 6px',textAlign:'right'}}>{arrow} {ta.slice(0,2).map((s:string,i:number)=><span key={i} style={{color:INK.dim,fontSize:9}}>{s.split('+')[0].split('-')[0].slice(0,6)}{i<ta.length-1?',':''}</span>)}</td>
              <td style={{padding:'3px 6px',textAlign:'right',color:tierColor,fontWeight:700}}>{tier}</td>
            </tr>;
          })}</tbody>
        </table></div>
      </Section>

      <div style={{fontSize:10,color:INK.faint,textAlign:'right',padding:'8px 0'}}>อัปเดต: {state?.updated_at?new Date(state.updated_at).toLocaleString('th-TH'):'—'}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{background:INK.panel,border:`1px solid ${INK.panelBorder}`,borderRadius:10,padding:12}}>
    <h4 style={{margin:'0 0 8px',fontSize:12,fontWeight:600,color:INK.dim}}>{title}</h4>{children}</div>;
}
function Empty() { return <div style={{color:INK.faint,fontSize:11,padding:8}}>—</div>; }
