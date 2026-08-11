89547:(e,t,s)=>{
"use strict";
s.r(t),s.d(t,{
default:()=>b}
);
var a=s(95155),n=s(52619),i=s.n(n),l=s(12115),r=s(62890),c=s(77823),d=s(93474),o=s(57362),m=s(20467),x=s(15307),h=s(33295),u=s(39823),p=s(51606),f=s(92497),v=s(57809),y=s(84107),j=s(59046);
let g=["us13w","us1y","us2y","us5y","us10y","us20y","us30y"],k=["us10y","us2y","vix","dxy","xauusd","usoil","us_hy_spread","us_banking_stress_index"];
async function N(){
var e,t,s,a,n,i;
let[l,c,d,o,m,x]=await Promise.all([r.ND.from("crisis_phase_current").select("*").single(),r.ND.from("model_scores").select("*").order("rank"),r.ND.from("macro_series").select("*").in("series_id",[...g,...k]),r.ND.from("risk_warnings").select("*").eq("active",!0).order("triggered_at",{
ascending:!1}
),r.ND.from("country_risk_scores").select("*"),r.ND.from("ai_briefs").select("*").order("generated_at",{
ascending:!1}
).limit(1)]);
return{
phase:l.data,models:null!=(t=c.data)?t:[],series:null!=(s=d.data)?s:[],warnings:null!=(a=o.data)?a:[],risks:null!=(n=m.data)?n:[],brief:null!=(i=null==(e=x.data)?void 0:e[0])?i:null}
}
function b(){
var e,t,s,n;
let{
t:b,lang:_}
=(0,d.s)(),{
data:w,loading:A,error:M,reload:z}
=(0,c.E)(N,{
refreshMs:6e4}
),[S,E]=(0,l.useState)(!1),[C,F]=(0,l.useState)(!1),[L,P]=(0,l.useState)(!1),[q,D]=(0,l.useState)(!1);
async function R(){
E(!0),P(!1);
try{
(await fetch("".concat(r.VI,"/functions/v1/ai-brief"),{
method:"POST",headers:{
Authorization:"Bearer ".concat(r.m5),"Content-Type":"application/json"}
,body:"{
}
"}
)).ok||P(!0),await z()}
catch(e){
P(!0)}
finally{
E(!1)}
}
if(M&&!w)return(0,a.jsx)(x.Xb,{
onRetry:z}
);
if(A||!w)return(0,a.jsxs)("div",{
className:"space-y-4",children:[(0,a.jsx)(x.EA,{
className:"h-8 w-64"}
),(0,a.jsx)("div",{
className:"grid grid-cols-1 gap-4 md:grid-cols-3",children:[...Array(6)].map((e,t)=>(0,a.jsx)(x.EA,{
className:"h-32"}
,t))}
)]}
);
let{
phase:Z,models:T,series:W,warnings:B,risks:K,brief:H}
=w,O=new Map(W.map(e=>[e.series_id,e])),V=T[0],Y=V?o.L6[V.model_id]:null,Q=Z&&null!=(s=o.Qw[Z.phase])?s:o.Qw.normal,U=g.map(e=>{
var t,s,a,n;
return{
tenor:null!=(a=null==(t=O.get(e))?void 0:t.tenor)?a:e,yield:null!=(n=null==(s=O.get(e))?void 0:s.value)?n:null}
}
),I=null==(e=O.get("us10y"))?void 0:e.value,X=null==(t=O.get("us2y"))?void 0:t.value;
return(0,a.jsxs)("div",{
className:"space-y-6",children:[(0,a.jsx)(x.zY,{
title:b.overview,subtitle:"".concat(b.lastUpdated,": ").concat((0,m.fF)(null==Z?void 0:Z.updated_at,_))}
),(0,a.jsxs)("div",{
className:"panel border-accent/25 bg-accent/[0.04] p-5",children:[(0,a.jsxs)("div",{
className:"flex flex-wrap items-center justify-between gap-2",children:[(0,a.jsxs)("div",{
className:"flex items-center gap-2 text-sm font-semibold text-accent",children:[(0,a.jsx)(u.A,{
size:15}
)," ",b.aiBrief,H&&(0,a.jsx)("span",{
className:"text-[10px] font-normal text-ink-faint",children:(0,m.fF)(H.generated_at,_)}
)]}
),(0,a.jsxs)("button",{
onClick:R,disabled:S,className:"flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent/40 hover:text-ink disabled:opacity-50",children:[(0,a.jsx)(p.A,{
size:11,className:S?"animate-spin":""}
)," ",b.refreshBrief]}
)]}
),L&&(0,a.jsx)("p",{
className:"mt-2 text-xs text-red-400",children:b.actionFailed}
),H?(0,a.jsxs)(a.Fragment,{
children:[(0,a.jsx)("p",{
className:"mt-3 whitespace-pre-line text-sm leading-relaxed ".concat(C?"":"line-clamp-4 md:line-clamp-none"),children:H.brief_md}
),(0,a.jsx)("button",{
onClick:()=>F(!C),className:"mt-1 text-xs font-medium text-accent md:hidden",children:C?b.readLess:b.readMore}
),Array.isArray(H.recommendations)&&H.recommendations.length>0&&(0,a.jsxs)("div",{
className:"mt-3",children:[(0,a.jsx)("div",{
className:"text-[11px] font-semibold uppercase tracking-wider text-ink-faint",children:b.aiRecommendations}
),(0,a.jsx)("ul",{
className:"mt-1.5 space-y-1",children:H.recommendations.map((e,t)=>(0,a.jsxs)("li",{
className:"flex gap-2 text-sm text-ink-dim",children:[(0,a.jsxs)("span",{
className:"num shrink-0 text-accent",children:[t+1,"."]}
)," ",e]}
,t))}
)]}
),Array.isArray(H.scenarios)&&H.scenarios.length>0&&(0,a.jsxs)("div",{
className:"mt-3",children:[(0,a.jsxs)("div",{
className:"flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint",children:[(0,a.jsx)(f.A,{
size:12,className:"text-amber-400"}
)," ",b.aiScenarios]}
),(0,a.jsx)("ul",{
className:"mt-1.5 space-y-1",children:H.scenarios.map((e,t)=>(0,a.jsxs)("li",{
className:"flex gap-2 text-sm text-ink-dim",children:[(0,a.jsxs)("span",{
className:"num shrink-0 text-amber-400",children:[t+1,"."]}
)," ",e]}
,t))}
)]}
),Array.isArray(H.key_events)&&H.key_events.length>0&&(0,a.jsxs)("div",{
className:"mt-4 border-t border-edge/50 pt-3",children:[(0,a.jsxs)("div",{
className:"flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint",children:[(0,a.jsx)(v.A,{
size:12}
)," ",b.upcomingEvents]}
),(0,a.jsx)("ul",{
className:"mt-1.5 space-y-1.5",children:H.key_events.map((e,t)=>{
var s;
return(0,a.jsxs)("li",{
className:"flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs",children:[(0,a.jsx)("span",{
className:"inline-block h-1.5 w-1.5 shrink-0 self-center rounded-full ".concat("High"===e.impact?"bg-red-400":"bg-amber-400"),title:e.impact}
),(0,a.jsx)("span",{
className:"num shrink-0 text-ink-faint",children:(s=e.date,(0,m.q_)(s,_,{
day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}
))}
),(0,a.jsx)("span",{
className:"rounded bg-panel-2 px-1 text-[10px] font-semibold text-ink-dim",children:e.country}
),(0,a.jsx)("span",{
className:"text-ink-dim",children:e.title}
),(e.forecast||e.previous)&&(0,a.jsxs)("span",{
className:"num text-[11px] text-ink-faint",children:[e.forecast?"".concat(b.forecastShort," ").concat(e.forecast):"",e.forecast&&e.previous?" \xb7 ":"",e.previous?"".concat(b.prevShort," ").concat(e.previous):""]}
)]}
,t)}
)}
),(0,a.jsx)("div",{
className:"mt-2 text-[10px] text-ink-faint",children:b.calendarSource}
)]}
)]}
):(0,a.jsx)("p",{
className:"mt-3 text-sm text-ink-faint",children:S?b.analyzing:b.chatMissingKey}
)]}
),B.length>0&&(0,a.jsxs)("div",{
className:"panel border-red-500/30 bg-red-500/5 p-4",children:[(0,a.jsxs)("div",{
className:"mb-2 flex items-center gap-2 text-sm font-semibold text-red-400",children:[(0,a.jsx)(y.A,{
size:15}
)," ",b.activeWarnings," (",B.length,")"]}
),(0,a.jsx)("div",{
className:"space-y-1.5",children:B.slice(0,4).map(e=>(0,a.jsxs)("div",{
className:"flex items-center gap-2 text-sm text-ink-dim",children:[(0,a.jsx)(x.Pt,{
severity:e.severity}
),(0,a.jsx)("span",{
children:"th"===_?e.message_th:e.message_en}
)]}
,e.id))}
)]}
),(0,a.jsxs)("div",{
className:"grid grid-cols-1 gap-4 lg:grid-cols-3",children:[(0,a.jsxs)("div",{
className:"panel p-5",children:[(0,a.jsx)("div",{
className:"text-xs uppercase tracking-wider text-ink-faint",children:b.regime}
),(0,a.jsx)("div",{
className:"mt-2 text-2xl font-bold ".concat(Q.color),children:"th"===_?Q.th:Q.en}
),(0,a.jsxs)("div",{
className:"mt-2 flex items-center gap-3 text-xs text-ink-dim",children:[(0,a.jsxs)("span",{
children:[b.confidence,": ",(0,a.jsxs)("span",{
className:"num font-semibold text-ink",children:[(0,m._E)(null!=(n=null==Z?void 0:Z.confidence)?n:0,0),"%"]}
)]}
),(null==Z?void 0:Z.is_transition_zone)&&(0,a.jsx)("span",{
className:"rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-400",children:b.transitionZone}
)]}
),(null==Z?void 0:Z.triggers)&&Z.triggers.length>0&&(0,a.jsx)("div",{
className:"mt-3 space-y-1",children:Z.triggers.slice(0,3).map(e=>(0,a.jsxs)("div",{
className:"flex items-center justify-between text-xs",children:[(0,a.jsx)("span",{
className:"text-ink-dim",children:e.name}
),(0,a.jsx)("span",{
className:"num text-ink-faint",children:e.strength}
)]}
,e.name))}
)]}
),(0,a.jsxs)("div",{
className:"panel p-5",children:[(0,a.jsx)("div",{
className:"text-xs uppercase tracking-wider text-ink-faint",children:b.topModel}
),(0,a.jsx)("div",{
className:"mt-2 text-lg font-bold leading-snug",children:Y?"th"===_?Y.nameTh:Y.nameEn:"—"}
),(0,a.jsxs)("div",{
className:"mt-1 flex items-center gap-2",children:[(0,a.jsx)("span",{
className:"num text-3xl font-bold text-accent",children:(0,m._E)(null==V?void 0:V.score,1)}
),(0,a.jsx)("span",{
className:"text-xs text-ink-faint",children:"/100"}
),V&&(0,a.jsx)("span",{
className:"rounded px-1.5 py-0.5 text-[11px] font-semibold ".concat(o.Zt[V.status].cls),children:"th"===_?o.Zt[V.status].th:o.Zt[V.status].en}
)]}
),Y&&(0,a.jsx)("p",{
className:"mt-2 text-xs leading-relaxed text-ink-dim",children:Y.tradeDirection}
),(0,a.jsxs)(i(),{
href:"/models",className:"mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline",children:[b.models," ",(0,a.jsx)(j.A,{
size:12}
)]}
)]}
),(0,a.jsxs)("div",{
className:"panel p-5",children:[(0,a.jsxs)("div",{
className:"flex items-center justify-between",children:[(0,a.jsx)("div",{
className:"text-xs uppercase tracking-wider text-ink-faint",children:b.countryRisk}
),(0,a.jsx)(i(),{
href:"/countries",className:"text-[11px] text-accent hover:underline",children:b.viewAll}
)]}
),(0,a.jsxs)("div",{
className:"mt-3 space-y-2",children:[[...K].sort((e,t)=>t.score-e.score).slice(0,q?void 0