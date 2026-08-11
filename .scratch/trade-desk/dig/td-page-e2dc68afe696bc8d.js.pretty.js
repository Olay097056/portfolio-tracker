(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[4681],{
7550:(e,t,a)=>{
"use strict";
a.d(t,{
A:()=>s}
);
let s=(0,a(56479).A)("arrow-down",[["path",{
d:"M12 5v14",key:"s699le"}
],["path",{
d:"m19 12-7 7-7-7",key:"1idqje"}
]])}
,13335:(e,t,a)=>{
"use strict";
a.r(t),a.d(t,{
default:()=>x}
);
var s=a(95155),l=a(12115),n=a(69746);
let i=(0,a(56479).A)("power",[["path",{
d:"M12 2v10",key:"mnfbl"}
],["path",{
d:"M18.4 6.6a9 9 0 1 1-12.77.04",key:"obofu9"}
]]);
var d=a(93474),r=a(77823),c=a(15307),o=a(20467),m=a(59704);
function x(){
let{
t:e,lang:t}
=(0,d.s)(),{
call:a,session:l,isAdmin:n,isRoot:i}
=(0,m.Cb)(),{
data:o,error:x,reload:p}
=(0,r.E)(()=>a({
action:"get_state",signals_limit:100}
),{
refreshMs:3e4,deps:[a],enabled:!!l&&i}
);
return n?i?(0,s.jsxs)("div",{
className:"space-y-5",children:[(0,s.jsx)(m.EG,{
t:e}
),(0,s.jsx)(c.zY,{
title:e.tdSettingsTitle}
),(0,s.jsx)("p",{
className:"-mt-3 text-xs text-ink-faint",children:e.tdSettingsDesc}
),x&&(0,s.jsx)("div",{
className:"panel p-4 text-sm text-red-400",children:e.actionFailed}
),o?(0,s.jsxs)(s.Fragment,{
children:[(0,s.jsx)(b,{
settings:o.settings,call:a,reload:p,t:e}
),(0,s.jsx)(j,{
signals:o.signals,teams:o.teams,settings:o.settings,t:e}
),(0,s.jsx)(g,{
settings:o.settings,call:a,reload:p,t:e}
,o.settings.updated_at),(0,s.jsx)(v,{
teams:o.teams,call:a,reload:p,t:e}
),(0,s.jsx)(u,{
proposals:o.proposals,teams:o.teams,call:a,reload:p,t:e,lang:t}
),(0,s.jsx)(h,{
reviews:o.reviews,lang:t,t:e}
),(0,s.jsx)(y,{
lessons:o.lessons,teams:o.teams,t:e,lang:t}
),(0,s.jsx)(f,{
teams:o.teams,call:a,reload:p,t:e}
)]}
):(0,s.jsxs)("div",{
className:"space-y-4",children:[(0,s.jsx)(c.EA,{
className:"h-16"}
),(0,s.jsx)(c.EA,{
className:"h-40"}
),(0,s.jsx)(c.EA,{
className:"h-72"}
)]}
)]}
):(0,s.jsxs)("div",{
className:"space-y-5",children:[(0,s.jsx)(m.EG,{
t:e}
),(0,s.jsx)(m.n,{
t:e}
)]}
):null}
let p={
pending:"bg-amber-500/15 text-amber-400",approved:"bg-emerald-500/15 text-emerald-400",rejected:"bg-rose-500/15 text-rose-400",expired:"bg-panel-2 text-ink-faint"}
;
function u(e){
let{
proposals:t,teams:a,call:i,reload:d,t:r,lang:c}
=e,[x,u]=(0,l.useState)(null),[h,y]=(0,l.useState)(null),[f,b]=(0,l.useState)(null),j=new Map(a.map(e=>[e.id,e.family])),_=t.filter(e=>"pending"===e.status),N=t.filter(e=>"pending"!==e.status).slice(0,8),g=async(e,t)=>{
u(e),b(null);
try{
await i({
action:t,proposal_id:e}
),d()}
catch(e){
b(e instanceof Error?e.message:r.actionFailed)}
finally{
u(null),y(null)}
}
;
return(0,s.jsxs)("section",{
className:"panel p-4",children:[(0,s.jsxs)("h2",{
className:"text-xs font-semibold text-ink-dim",children:[r.tdProposals,_.length>0&&(0,s.jsx)("span",{
className:"ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400",children:_.length}
)]}
),(0,s.jsx)("p",{
className:"mt-1 text-[10px] text-ink-faint",children:r.tdProposalsDesc}
),f&&(0,s.jsx)("div",{
className:"mt-2 text-[11px] text-rose-400",children:f}
),(0,s.jsxs)("div",{
className:"mt-3 space-y-2",children:[!_.length&&(0,s.jsx)("p",{
className:"text-[11px] text-ink-faint",children:r.tdNoProposals}
),_.map(e=>(0,s.jsxs)("div",{
className:"rounded-xl border border-amber-500/25 p-3",children:[(0,s.jsxs)("div",{
className:"flex flex-wrap items-center gap-2",children:[(0,s.jsx)("span",{
className:"rounded px-1.5 py-0.5 text-[10px] font-bold ".concat("fire"===e.type?"bg-rose-500/15 text-rose-400":"bg-emerald-500/15 text-emerald-400"),children:"fire"===e.type?"\uD83D\uDD25 ".concat(r.tdProposalFire):"\uD83D\uDCB0 ".concat(r.tdProposalFund)}
),j.has(e.team_id)&&(0,s.jsx)("span",{
className:"rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ".concat(m.FQ[j.get(e.team_id)]),children:j.get(e.team_id)}
),(0,s.jsx)("span",{
className:"text-xs font-medium",children:e.team_id}
),(0,s.jsx)("span",{
className:"text-[10px] text-ink-faint",children:(0,o.fF)(e.created_at,c)}
),(0,s.jsxs)("div",{
className:"ml-auto flex items-center gap-1.5",children:[h===e.id?(0,s.jsx)("button",{
onClick:()=>g(e.id,"approve_proposal"),disabled:null!==x,className:"rounded-lg bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/30 disabled:opacity-50",children:x===e.id?(0,s.jsx)(n.A,{
size:12,className:"animate-spin"}
):r.tdConfirm}
):(0,s.jsx)("button",{
onClick:()=>y(e.id),disabled:null!==x,className:"rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50",children:r.tdApprove}
),(0,s.jsx)("button",{
onClick:()=>g(e.id,"reject_proposal"),disabled:null!==x,className:"rounded-lg bg-panel-2 px-2.5 py-1 text-[11px] text-ink-dim hover:text-rose-400 disabled:opacity-50",children:r.tdReject}
)]}
)]}
),(0,s.jsx)("div",{
className:"mt-1.5 text-[11px] text-ink-dim",children:(e=>{
var t,a,s,l,n;
let i=null!=(t=e.payload)?t:{
}
;
return"fund_increase"===e.type?"+$".concat((0,o._E)(Number(null!=(a=i.amount)?a:0),0)," \xb7 equity $").concat((0,o._E)(Number(null!=(s=i.equity)?s:0),0)).concat(null!=i.composite?" \xb7 ".concat(r.tdComposite," ").concat(i.composite):""):"equity_floor"===i.reason?"equity $".concat((0,o._E)(Number(null!=(l=i.equity)?l:0),0)," < ").concat(i.threshold_pct,"%"):"rank_last"===i.reason?"".concat(r.tdRank,"สุดท้าย ").concat(i.weeks," สัปดาห์ติด"):String(null!=(n=i.reason)?n:"")}
)(e)}
),"fire"===e.type&&h===e.id&&(0,s.jsxs)("div",{
className:"mt-1.5 text-[10px] text-rose-400",children:["⚠️ ",r.tdFireWarning]}
)]}
,e.id)),N.length>0&&(0,s.jsxs)("details",{
children:[(0,s.jsxs)("summary",{
className:"cursor-pointer text-[11px] text-ink-faint",children:[r.tdDecidedRecent," \xb7 ",N.length]}
),(0,s.jsx)("div",{
className:"mt-2 space-y-1",children:N.map(e=>{
var t;
let a;
return(0,s.jsxs)("div",{
className:"flex flex-wrap items-center gap-2 text-[11px]",children:[(0,s.jsx)("span",{
className:"rounded-full px-2 py-0.5 text-[10px] ".concat(p[e.status]),children:"pending"===(a=e.status)?r.tdStatusPending:"approved"===a?r.tdStatusApproved:"rejected"===a?r.tdStatusRejected:r.tdStatusExpired}
),(0,s.jsx)("span",{
children:"fire"===e.type?r.tdProposalFire:r.tdProposalFund}
),(0,s.jsx)("span",{
className:"text-ink-dim",children:e.team_id}
),(null==(t=e.result)?void 0:t.new_team)!=null&&(0,s.jsxs)("span",{
className:"text-ink-faint",children:["→ ",String(e.result.new_team)]}
),(0,s.jsxs)("span",{
className:"text-ink-faint",children:[e.decided_at?(0,o.fF)(e.decided_at,c):"",e.decided_by?" \xb7 ".concat(e.decided_by):""]}
)]}
,e.id)}
)}
)]}
)]}
)]}
)}
function h(e){
let{
reviews:t,t:a,lang:l}
=e,n=t.find(e=>"daily"===e.kind&&!e.team_id),i=t.find(e=>"weekly"===e.kind&&!e.team_id),d=t.find(e=>"monthly"===e.kind&&!e.team_id),r=e=>{
let a=new Set;
return t.filter(t=>t.kind===e&&t.team_id).filter(e=>!a.has(e.team_id)&&(a.add(e.team_id),!0)).sort((e,t)=>{
var a,s,l,n;
return Number(null!=(l=null==(a=e.scores)?void 0:a.rank)?l:99)-Number(null!=(n=null==(s=t.scores)?void 0:s.rank)?n:99)}
)}
,c=r("weekly"),m=r("monthly"),x=(e,t)=>{
var a;
let s=null==(a=e.scores)?void 0:a[t];
return null==s?"—":String(s)}
;
return(0,s.jsxs)("section",{
className:"panel p-4",children:[(0,s.jsx)("h2",{
className:"text-xs font-semibold text-ink-dim",children:a.tdSupervisor}
),!n&&!c.length&&!m.length&&(0,s.jsx)("p",{
className:"mt-2 text-[11px] text-ink-faint",children:a.tdNoReviews}
),m.length>0&&(0,s.jsxs)("div",{
className:"mt-3",children:[(0,s.jsxs)("div",{
className:"mb-1.5 flex items-baseline justify-between gap-2",children:[(0,s.jsx)("div",{
className:"text-[11px] font-semibold text-ink-dim",children:a.tdMonthlyRanking}
),(0,s.jsx)("span",{
className:"text-[10px] text-ink-faint",children:d?(0,o.fF)(d.created_at,l):""}
)]}
),(0,s.jsx)("div",{
className:"overflow-x-auto",children:(0,s.jsxs)("table",{
className:"w-full text-xs",children:[(0,s.jsx)("thead",{
children:(0,s.jsxs)("tr",{
className:"text-left text-[10px] uppercase text-ink-faint",children:[(0,s.jsx)("th",{
className:"py-1.5 pr-3 font-medium",children:a.tdRank}
),(0,s.jsx)("th",{
className:"py-1.5 pr-3 font-medium",children:a.tdTeams}
),(0,s.jsx)("th",{
className:"py-1.5 pr-3 text-right font-medium",children:a.tdComposite}
),(0,s.jsx)("th",{
className:"py-1.5 pr-3 text-right font-medium",children:"PnL%"}
),(0,s.jsx)("th",{
className:"py-1.5 pr-3 text-right font-medium",children:a.tdTargetCol}
),(0,s.jsx)("th",{
className:"py-1.5 text-right font-medium",children:a.tdClosedN}
)]}
)}
),(0,s.jsx)("tbody",{
children:m.map(e=>{
var t,a;
return(0,s.jsxs)("tr",{
className:"border-t border-edge/60",children:[(0,s.jsxs)("td",{
className:"py-1.5 pr-3 font-semibold tabular-nums",children:["#",x(e,"rank"),"/",x(e,"of")]}
),(0,s.jsx)("td",{
className:"py-1.5 pr-3",children:e.team_id}
),(0,s.jsx)("td",{
className:"py-1.5 pr-3 text-right font-semibold tabular-nums",children:x(e,"composite")}
),(0,s.jsxs)("td",{
className:"py-1.5 pr-3 text-right tabular-nums ".concat(Number(null!=(a=null==(t=e.scores)?void 0:t.pnl_pct)?a:0)>=0?"text-emerald-400":"text-rose-400"),children:[x(e,"pnl_pct"),"%"]}
),(0,s.jsx)("td",{
className:"py-1.5 pr-3 text-right",title:"".concat(x(e,"target_floor"),"–").concat(x(e,"target_stretch"),"%"),children:(e=>{
var t,a,s,l,n,i;
let d=Number(null!=(l=null==(t=e.scores)?void 0:t.pnl_pct)?l:NaN),r=Number(null!=(n=null==(a=e.scores)?void 0:a.target_floor)?n:NaN),c=Number(null!=(i=null==(s=e.scores)?void 0:s.target_stretch)?i:NaN);
return Number.isFinite(d)&&Number.isFinite(r)?Number.isFinite(c)&&d>=c?"\uD83C\uDF1F":d>=r?"✅":"⚠️":"—"}
)(e)}
),(0,s.jsx)("td",{
className:"py-1.5 text-right tabular-nums text-ink-faint",children:x(e,"closed_n")}
)]}
,e.id)}
)}
)]}
)}
),(null==d?void 0:d.report_md)&&(0,s.jsx)("pre",{
className:"mt-2 whitespace-pre-wrap rounded-lg bg-panel-2 p-3 text-[11px] leading-relaxed text-ink-dim",children:d.report_md}
)]}
),c.length>0&&(0,s.jsxs)("div",{
className:"mt-3",children:[(0,s.jsxs)("div",{
className:"mb-1.5 flex items-baseline justify-between gap-2",children:[(0,s.jsx)("div",{
className:"text-[11px] font-semibold text-ink-dim",children:a.tdWeeklyRanking}
),(0,s.jsx)("span",{
className:"text-[10px] text-ink-faint",children:i?(0,o.fF)(i.created_at,l):""}
)]}
),(0,s.jsx)("div",{
className:"overflow-x-auto",children:(0,s.jsxs)("table",{
className:"w-full text-xs",children:[(0,s.jsx)("thead",{
children:(0,s.jsxs)("tr",{
className:"text-left text-[10px] uppercase text-ink-faint",children:[(0,s.jsx)("th",{
className:"py-1.5 pr-3 font-medium",children:a.tdRank}
),(0,s.jsx)("th",{
className:"py-1.5 pr-3 font-medium",children:a.tdTeams}
),(0,s.jsx)("th",{
className:"py-1.5 pr-3 text-right font-medium",children:a.tdComposite}
),(0,s.jsx)("th",{
className:"py-1.5 pr-3 text-right font-medium",children:"PnL%"}
),(0,s.jsx)("th",{
className:"py-1.5 pr-3 text-right font-medium",title:a.tdScoreCols,children:a.tdScoreCols}
),(0,s.jsx)("th",{
className:"py-1.5 pr-3 text-right font-medium",children:a.tdOverride}
),(0,s.jsx)("th",{
className:"py-1.5 text-right font-medium",children:a.tdClosedN}
)]}
)}
),(0,s.jsx)("tbody",{
children:c.map(e=>{
var t,a;
return(0,s.jsxs)("tr",{
className:"border-t border-edge/60",children:[(0,s.jsxs)("td",{
className:"py-1.5 pr-3 font-semibold tabular-nums",children:["#",x(e,"rank"),"/",x(e,"of")]}
),(0,s.jsx)("td",{
className:"py-1.5 pr-3",children:e.team_id}
),(0,s.jsx)("td",{
className:"py-1.5 pr-3 text-right font-semibold tabular-nums",children:x(e,"composite")}
),(0,s.jsxs)("td",{
className:"py-1.5 pr-3 text-right tabular-nums ".concat(Number(null!=(a=null==(t=e.scores)?void 0:t.pnl_pct)?a:0)>=0?"text-emerald-400":"text-rose-400"),children:[x(e,"pnl_pct"),"%"]}
),(0,s.jsxs)("td",{
className:"py-1.5 pr-3 text-right tabular-nums text-ink-dim",children:[x(e,"pnl")," \xb7 ",x(e,"sharpe")," \xb7 ",x(e,"dd")," \xb7 ",x(e,"pf")," \xb7 ",x(e,"disc")]}
),(0,s.jsxs)("td",{
className:"py-1.5 pr-3 text-right tabular-nums text-ink-faint",children:[x(e,"override_rate"),"%"]}
),(0,s.jsx)("td",{
className:"py-1.5 text-right tabular-nums text-ink-faint",children:x(e,"closed_n")}
)]}
,e.id)}
)}
)]}
)}
),(null==i?void 0:i.report_md)&&(0,s.jsx)("pre",{
className:"mt-2 whitespace-pre-wrap rounded-lg bg-panel-2 p-3 text-[11px] leading-relaxed text-ink-dim",children:i.report_md}
)]}
),(null==n?void 0:n.report_md)&&(0,s.jsxs)("details",{
className:"mt-3",open:!c.length,children:[(0,s.jsxs)("summary",{
className:"cursor-pointer text-[11px] font-semibold text-ink-dim",children:[a.tdDailyDigest," \xb7 ",(0,o.fF)(n.created_at,l)]}
),(0,s.jsx)("pre",{
className:"mt-2 whitespace-pre-wrap rounded-lg bg-panel-2 p-3 text-[11px] leading-relaxed text-ink-dim",children:n.report_md}
)]}
)]}
)}
function y(e){
let{
lessons:t,teams:a,t:l,lang:n}
=e,i=new Map(a.map(e=>[e.id,e.family]));
return(0,s.jsxs)("section",{
className:"panel p-4",children:[(0,s.jsx)("h2",{
className:"text-xs font-semibold text-ink-dim",children:l.tdLessons}
),(0,s.jsx)("p",{
className:"mt-1 text-[10px] text-ink-faint",children:l.tdLessonsDesc}
),(0,s.jsxs)("div",{
className:"mt-3 space-y-1.5",children:[!t.length&&(0,s.jsx)("p",{
className:"text-[11px] text-ink-faint",children:l.tdNoLessons}
),t.map(e=>(0,s.jsxs)("details",{
className:"rounded-lg border border-edge/60 px-3 py-2",children:[(0,s.jsxs)("summary",{
className:"flex cursor-pointer flex-wrap items-center gap-2 text-[11px]",children:[(0,s.jsxs)("span",{
className:"font-medium",children:[e.market.replace(/^xyz:/,"")," ",e.side]}
),(0,s.jsxs)("span",{
className:"tabular-nums text-rose-400",children:["$",(0,o._E)(Number(e.net_pnl),2)]}
),i.has(e.team_id)&&(0,s.jsx)("span",{
className:"rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ".concat(m.FQ[i.get(e.team_id)]),children:i.get(e.team_id)}
),(0,s.jsx)("span",{
className:"text-ink-faint",children:e.team_id}
),null!=e.holding_hours&&(0,s.jsxs)("span",{
className:"text-[10px] text-ink-faint",children:[(0,o._E)(Number(e.holding_hours),1),"h"]}
),(0,s.jsx)("span",{
className:"ml-auto text-[10px] text-ink-faint",children:(0,o.fF)(e.created_at,n)}
)]}
),(0,s.jsx)("p",{
className:"mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-ink-dim",children:e.reason_md}
),e.tags.length>0&&(0,s.jsx)("div",{
className:"mt-1.5 flex flex-wrap gap-1",children:e.tags.map(e=>(0,s.jsx)("span",{
className:"rounded bg-panel-2 px-1.5 py-0.5 text-[9px] text-ink-faint",children:e}
,e))}
)]}
,e.id))]}
)]}
)}
function f(e){
let{
teams:t,call:a,reload:i,t:d}
=e,[r,c]=(0,l.useState)(null),o=async(e,t)=>{
c(e);
try{
await a({
action:t,team_id:e}
),i()}
catch(e){
}
finally{
c(null)}
}
;
return(0,s.jsxs)("section",{
className:"panel p-4",children:[(0,s.jsx)("h2",{
className:"text-xs font-semibold text-ink-dim",children:d.tdTeamsControl}
),(0,s.jsx)("p",{
className:"mt-1 text-[10px] text-ink-faint",children:d.tdPauseHint}
),(0,s.jsx)("div",{
className:"mt-3 space-y-1.5",children:t.map(e=>{
var t;
return(0,s.jsxs)("div",{
className:"flex flex-wrap items-center gap-2",children:[(0,s.jsx)("span",{
className:"w-20 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-bold uppercase ".concat(m.FQ[e.family]),children:e.family}
),(0,s.jsx)("span",{
className:"w-28 text-[11px] text-ink-dim",children:e.id}
),(0,s.jsx)("span",{
className:"rounded-full px-2 py-0.5 text-[10px] font-medium ".concat(m.qv[e.status]),children:(0,m.Mm)(d,e.status)}
),"fired"===e.status?(0,s.jsx)("span",{
className:"text-[10px] text-ink-faint",children:null!=(t=e.fire_reason)?t:""}
):["active","probation","paused"].includes(e.status)&&(0,s.jsx)("button",{
onClick:()=>o(e.id,"paused"===e.status?"resume_team":"pause_team"),disabled:null!==r,className:"rounded-lg px-2.5 py-1 text-[11px] font-medium disabled:opacity-50 ".concat("paused"===e.status?"bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25":"bg-panel-2 text-ink-dim hover:text-amber-400"),children:r===e.id?(0,s.jsx)(n.A,{
size:12,className:"animate-spin"}
):"paused"===e.status?d.tdResume:d.tdPause}
)]}
,e.id)}
)}
)]}
)}
function b(e){
let{
settings:t,call:a,reload:d,t:r}
=e,[c,o]=(0,l.useState)(!1),m=t.enabled;
return(0,s.jsxs)("div",{
className:"panel flex items-center justify-between gap-3 p-4 ".concat(m?"":"border-amber-500/30"),children:[(0,s.jsxs)("div",{
className:"flex items-center gap-3",children:[(0,s.jsx)("div",{
className:"flex h-9 w-9 items-center justify-center rounded-lg ".concat(m?"bg-emerald-500/15 text-emerald-400":"bg-amber-500/15 text-amber-400"),children:(0,s.jsx)(i,{
size:17}
)}
),(0,s.jsxs)("div",{
children:[(0,s.jsx)("div",{
className:"text-sm font-medium",children:m?r.tdMasterOn:r.tdMasterOff}
),(0,s.jsxs)("div",{
className:"text-[11px] text-ink-faint",children:["paper \xb7 lev ≤",t.max_leverage,"x \xb7 ≤",t.max_position_equity_pct,"%/position \xb7 SL required \xb7 turn ",t.turn_interval_min,"m"]}
)]}
)]}
),(0,s.jsx)("button",{
onClick:async()=>{
o(!0);
try{
await a({
action:"set_settings",settings:{
enabled:!m}
}
),d()}
catch(e){
}
finally{
o(!1)}
}
,disabled:c,className:"rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ".concat(m?"bg-rose-500/15 text-rose-400 hover:bg-rose-500/25":"bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"),children:c?(0,s.jsx)(n.A,{
size:14,className:"animate-spin"}
):m?"OFF":"ON"}
)]}
)}
function j(e){
let{
signals:t,teams:a,settings:l,t:n}
=e,i=new Date().toISOString().slice(0,10),d=t.filter(e=>e.created_at>=i),r=new Map,c=0,x=0;
for(let e of d){
var p;
let t=(0,m.Mc)(e);
c+=t,r.set(e.team_id,(null!=(p=r.get(e.team_id))?p:0)+t),"ok"===e.status&&x++}
return(0,s.jsxs)("section",{
className:"panel p-4",title:n.tdCostNote,children:[(0,s.jsxs)("div",{
className:"flex flex-wrap items-center gap-x-4 gap-y-1.5",children:[(0,s.jsxs)("span",{
className:"text-xs font-semibold tabular-nums",children:["\uD83D\uDCB0 ",n.tdCostToday," ≈ $",c.toFixed(2)]}
),(0,s.jsxs)("span",{
className:"ml-auto text-[11px] text-ink-faint",children:[n.tdTurnsUsed,": ",x,"/",l.daily_turn_cap]}
)]}
),(0,s.jsx)("div",{
className:"mt-3 overflow-x-auto",children:(0,s.jsxs)("table",{
className:"w-full text-xs",children:[(0,s.jsx)("thead",{
children:(0,s.jsxs)("tr",{
className:"text-left text-[10px] uppercase text-ink-faint",children:[(0,s.jsx)("th",{
className:"py-1.5 pr-3 font-medium",children:n.tdTeams}
),(0,s.jsx)("th",{
className:"py-1.5 pr-3 text-right font-medium",children:n.tdCostToday}
),(0,s.jsx)("th",{
className:"py-1.5 pr-3 text-right font-medium",children:n.tdCostLifetime}
),(0,s.jsx)("th",{
className:"py-1.5 pr-3 text-right font-medium",children:"tokens"}
),(0,s.jsx)("th",{
className:"py-1.5 text-right font-medium",children:n.tdLlmCalls}
)]}
)}
),(0,s.jsx)("tbody",{
children:a.map(e=>{
var t;
return(0,s.jsxs)("tr",{
className:"border-t border-edge/60",children:[(0,s.jsxs)("td",{
className:"py-1.5 pr-3",children:[(0,s.jsx)("span",{
className:"rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ".concat(m.FQ[e.family]),children:e.family}
)," ",(0,s.jsx)("span",{
className:"text-[11px] text-ink-dim",children:e.id}
)]}
),(0,s.jsxs)("td",{
className:"py-1.5 pr-3 text-right tabular-nums",children:["$",(null!=(t=r.get(e.id))?t:0).toFixed(2)]}
),(0,s.jsxs)("td",{
className:"py-1.5 pr-3 text-right tabular-nums",children:["$",(0,m.tJ)(e).toFixed(2)]}
),(0,s.jsxs)("td",{
className:"py-1.5 pr-3 text-right tabular-nums text-ink-dim",children:[(0,o._E)((Number(e.tokens_in)+Number(e.tokens_out))/1e6,2),"M"]}
),(0,s.jsx)("td",{
className:"py-1.5 text-right tabular-nums text-ink-dim",children:e.llm_calls}
)]}
,e.id)}
)}
)]}
)}
)]}
)}
let _=[{
name:e=>e.tdGroupCadence,fields:[{
key:"turn_interval_min",lo:30,hi:1440,label:e=>e.tdTurnInterval}
,{
key:"daily_turn_cap",lo:0,hi:120,label:e=>e.tdDailyCap}
,{
key:"per_team_daily_cap",lo:0,hi:16,label:e=>e.tdPerTeamCap}
,{
key:"wake_move_pct",lo:.5,hi:20,label:e=>e.tdWakeMovePct}
,{
key:"wake_cooldown_min",lo:5,hi:720,label:e=>e.tdWakeCooldown}
,{
key:"wake_cap_daily",lo:0,hi:12,label:e=>e.tdWakeCapDaily}
]}
,{
name:e=>e.tdGroupRisk,fields:[{
key:"max_leverage",lo:1,hi:20,label:e=>e.tdMaxLev}
,{
key:"max_position_equity_pct",lo:1,hi:60,label:e=>e.tdMaxPosEquityPct}
,{
key:"max_open_positions",lo:1,hi:8,label:e=>e.tdMaxOpenPositions}
,{
key:"max_actions_per_turn",lo:1,hi:5,label:e=>e.tdMaxActionsPerTurn}
,{
key:"min_hold_h",lo:0,hi:24,label:e=>e.tdMinHoldH}
,{
key:"min_order_usd",lo:10,hi:2e3,label:e=>e.tdMinOrderUsd}
,{
key:"stale_marks_close_min",lo:3,hi:60,label:e=>e.tdStaleClose}
,{
key:"stale_marks_turn_min",lo:2,hi:30,label:e=>e.tdStaleTurn}
]}
,{
name:e=>e.tdGroupMarkets,fields:[{
key:"market_top_n",lo:5,hi:40,label:e=>e.tdTopN}
,{
key:"taker_fee_bps",lo:0,hi:20,label:e=>e.tdTakerFeeBps}
]}
,{
name:e=>e.tdGroupLlm,fields:[{
key:"analyst_max_tokens",lo:200,hi:2e3,label:e=>e.tdAnalystMaxTokens}
,{
key:"lead_max_tokens",lo:400,hi:6e3,label:e=>e.tdLeadMaxTokens}
,{
key:"analyst_timeout_s",lo:10,hi:90,label:e=>e.tdAnalystTimeout}
,{
key:"quorum_min",lo:3,hi:6,label:e=>e.tdQuorumMin}
,{
key:"analyst_ctx_chars",lo:2e3,hi:2e4,label:e=>e.tdAnalystCtx}
,{
key:"lead_ctx_chars",lo:4e3,hi:4e4,label:e=>e.tdLeadCtx}
]}
,{
name:e=>e.tdGroupSupervisor,fields:[{
key:"probation_equity_pct",lo:50,hi:95,label:e=>e.tdProbationPct}
,{
key:"probation_exit_equity_pct",lo:55,hi:100,label:e=>e.tdProbationExitPct}
,{
key:"fire_equity_pct",lo:40,hi:90,label:e=>e.tdFirePct}
,{
key:"fire_weeks_last",lo:2,hi:12,label:e=>e.tdFireWeeks}
,{
key:"fire_min_trades",lo:5,hi:100,label:e=>e.tdFireMinTrades}
,{
key:"fund_increase_target_pct",lo:105,hi:300,label:e=>e.tdFundTargetPct}
,{
key:"fund_increase_amount",lo:500,hi:5e4,label:e=>e.tdFundAmount}
,{
key:"monthly_target_floor_pct",lo:0,hi:50,label:e=>e.tdMonthlyTargetFloor}
,{
key:"monthly_target_stretch_pct",lo:0,hi:100,label:e=>e.tdMonthlyTargetStretch}
]}
],N=_.flatMap(e=>e.fields);
function g(e){
let{
settings:t,call:a,reload:i,t:d}
=e,[r,c]=(0,l.useState)(()=>Object.fromEntries(N.map(e=>{
var a;
return[e.key,String(null!=(a=t[e.key])?a:"")]}
))),[o,m]=(0,l.useState)(!1),[x,p]=(0,l.useState)(!1),u=async()=>{
let e={
}
;
for(let a of N){
let s=Number(r[a.key]);
Number.isFinite(s)&&s!==Number(t[a.key])&&(e[a.key]=s)}
if(!Object.keys(e).length)return void p(!0);
m(!0),p(!1);
try{
await a({
action:"set_settings",settings:e}
),p(!0),i()}
catch(e){
}
finally{
m(!1)}
}
;
return(0,s.jsxs)("section",{
className:"panel p-4",children:[(0,s.jsx)("h2",{
className:"text-xs font-semibold text-ink-dim",children:d.tdSettings}
),(0,s.jsx)("div",{
className:"mt-3 space-y-4",children:_.map(e=>(0,s.jsxs)("div",{
children:[(0,s.jsx)("div",{
className:"mb-2 text-[11px] font-semibold text-ink-dim",children:e.name(d)}
),(0,s.jsx)("div",{
className:"grid gap-3 sm:grid-cols-3 lg:grid-cols-4",children:e.fields.map(e=>{
var t;
return(0,s.jsxs)("label",{
className:"block text-[11px] text-ink-faint",children:[e.label(d),(0,s.jsx)("input",{
type:"number",value:null!=(t=r[e.key])?t:"",min:e.lo,max:e.hi,title:"".concat(e.lo," – ").concat(e.hi),onChange:t=>c(a=>({
...a,[e.key]:t.target.value}
)),className:"mt-1 w-full rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/50"}
)]}
,e.key)}
)}
)]}
,e.name(d)))}
),(0,s.jsxs)("div",{
className:"mt-4 flex items-center gap-3",children:[(0,s.jsx)("button",{
onClick:u,disabled:o,className:"rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/25 disabled:opacity-50",children:o?(0,s.jsx)(n.A,{
size:14,className:"animate-spin"}
):d.tdSave}
),x&&(0,s.jsx)("span",{
className:"text-[11px] text-emerald-400",children:d.tdSaved}
)]}
)]}
)}
let k=["openrouter","anthropic","openai","gemini","deepseek","glm"];
function v(e){
let{
teams:t,call:a,reload:i,t:d}
=e,[r,c]=(0,l.useState)(()=>Object.fromEntries(t.map(e=>[e.id,{
lead_provider:e.lead_provider,lead_model:e.lead_model,analyst_provider:e.analyst_provider,analyst_model:e.analyst_model}
]))),[o,x]=(0,l.useState)(null),[p,u]=(0,l.useState)(null),[h,y]=(0,l.useState)({
}
),f=e=>{
e in h||(y(t=>({
...t,[e]:null}
)),a({
action:"list_models",provider:e}
).then(t=>y(a=>{
var s;
return{
...a,[e]:null!=(s=t.models)?s:[]}
}
)).catch(()=>y(t=>({
...t,[e]:[]}
))))}
,[b,j]=(0,l.useState)({
}
);
(0,l.useEffect)(()=>{
let e=new Set;
for(let i of t){
var a,s,l,n;
e.add(String(null!=(l=null==(a=r[i.id])?void 0:a.lead_provider)?l:i.lead_provider)),e.add(String(null!=(n=null==(s=r[i.id])?void 0:s.analyst_provider)?n:i.analyst_provider))}
e.forEach(e=>f(e))}
,[t]);
let _=(e,a,s)=>c(l=>{
var n;
let i=t.find(t=>t.id===e),d=null!=(n=l[e])?n:i?{
lead_provider:i.lead_provider,lead_model:i.lead_model,analyst_provider:i.analyst_provider,analyst_model:i.analyst_model}
:{
}
;
return{
...l,[e]:{
...d,[a]:s}
}
}
);
return(0,s.jsxs)("section",{
className:"panel p-4",children:[(0,s.jsx)("h2",{
className:"text-xs font-semibold text-ink-dim",children:d.tdModelsEditor}
),(0,s.jsx)("p",{
className:"mt-1 text-[10px] text-ink-faint",children:d.tdModelsHint}
),Object.entries(h).map(e=>{
let[t,a]=e;
return(0,s.jsx)("datalist",{
id:"td-models-".concat(t),children:(null!=a?a:[]).map(e=>(0,s.jsx)("option",{
value:e}
,e))}
,t)}
),(0,s.jsx)("div",{
className:"mt-3 space-y-2",children:t.map(e=>{
var t;
let l=null!=(t=r[e.id])?t:{
lead_provider:e.lead_provider,lead_model:e.lead_model,analyst_provider:e.analyst_provider,analyst_model:e.analyst_model}
,c=t=>(0,s.jsx)("select",{
value:l[t],onChange:a=>_(e.id,t,a.target.value),className:"rounded-lg border border-edge bg-panel-2 px-1.5 py-1.5 text-[11px] text-ink outline-none",children:k.map(e=>(0,s.jsx)("option",{
value:e,children:e}
,e))}
),y=(t,a,n)=>{
let i="".concat(e.id,":").concat(t),r=h[l[a]],c=Array.isArray(r)&&r.length>0;
if(c&&!b[i]){
let a=r.includes(l[t])||!l[t]?r:[l[t],...r];
return(0,s.jsxs)("select",{
value:l[t],onChange:a=>{
if("__other__"===a.target.value)return void j(e=>({
...e,[i]:!0}
));
_(e.id,t,a.target.value)}
,className:"min-w-0 max-w-56 flex-1 rounded-lg border border-edge bg-panel-2 px-1.5 py-1.5 text-[11px] text-ink outline-none focus:border-accent/50",children:[a.map(e=>(0,s.jsx)("option",{
value:e,children:e}
,e)),(0,s.jsx)("option",{
value:"__other__",children:d.tdModelOther}
)]}
)}
return(0,s.jsxs)("span",{
className:"flex min-w-0 flex-1 items-center gap-1",children:[(0,s.jsx)("input",{
value:l[t],onChange:a=>_(e.id,t,a.target.value),onFocus:()=>f(l[a]),list:"td-models-".concat(l[a]),placeholder:n,className:"min-w-0 flex-1 rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-accent/50"}
),c&&(0,s.jsx)("button",{
onClick:()=>j(e=>({
...e,[i]:!1}
)),className:"shrink-0 rounded px-1 text-[10px] text-ink-faint hover:text-ink-dim",title:d.tdModelsEditor,children:"▾"}
)]}
)}
;
return(0,s.jsxs)("div",{
className:"space-y-1",children:[(0,s.jsxs)("div",{
className:"flex flex-wrap items-center gap-1.5",children:[(0,s.jsx)("span",{
className:"w-20 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-bold uppercase ".concat(m.FQ[e.family]),children:e.family}
),(0,s.jsx)("span",{
className:"text-[10px] text-ink-faint",children:d.tdLeadModel}
),c("lead_provider"),y("lead_model","lead_provider",d.tdLeadModel),(0,s.jsx)("span",{
className:"text-[10px] text-ink-faint",children:d.tdAnalystModel}
),c("analyst_provider"),y("analyst_model","analyst_provider",d.tdAnalystModel),(0,s.jsx)("button",{
onClick:async()=>{
x(e.id),u(null);
try{
let t=await a({
action:"set_team_models",team_id:e.id,models:l}
);
u({
team:e.id,text:!1===t.verified?d.tdUnverifiedModel:d.tdSaved,ok:!0}
),i()}
catch(t){
u({
team:e.id,text:t instanceof Error?t.message:d.actionFailed,ok:!1}
)}
finally{
x(null)}
}
,disabled:null!==o,className:"rounded-lg bg-accent/15 px-2.5 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/25 disabled:opacity-50",children:o===e.id?(0,s.jsx)(n.A,{
size:12,className:"animate-spin"}
):d.tdSave}
)]}
),(null==p?void 0:p.team)===e.id&&(0,s.jsx)("div",{
className:"text-[11px] ".concat(p.ok?"text-emerald-400":"text-rose-400"),children:p.text}
)]}
,e.id)}
)}
)]}
)}
}
,15169:(e,t,a)=>{
Promise.resolve().then(a.bind(a,13335))}
,20063:(e,t,a)=>{
"use strict";
var s=a(47260);
a.o(s,"notFound")&&a.d(t,{
notFound:function(){
return s.notFound}
}
),a.o(s,"useParams")&&a.d(t,{
useParams:function(){
return s.useParams}
}
),a.o(s,"usePathname")&&a.d(t,{
usePathname:function(){
return s.usePathname}
}
),a.o(s,"useRouter")&&a.d(t,{
useRouter:function(){
return s.useRouter}
}
)}
,23916:(e,t,a)=>{
"use strict";
a.d(t,{
A:()=>s}
);
let s=(0,a(56479).A)("chevron-down",[["path",{
d:"m6 9 6 6 6-6",key:"qrunsl"}
]])}
,40209:(e,t,a)=>{
"use strict";
a.d(t,{
A:()=>s}
);
let s=(0,a(56479).A)("arrow-up",[["path",{
d:"m5 12 7-7 7 7",key:"hav0vg"}
],["path",{
d:"M12 19V5",key:"x0mq9r"}
]])}
,51606:(e,t,a)=>{
"use strict";
a.d(t,{
A:()=>s}
);
let s=(0,a(56479).A)("refresh-cw",[["path",{
d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}
],["path",{
d:"M21 3v5h-5",key:"1q7to0"}
],["path",{
d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}
],["path",{
d:"M8 16H3v5",key:"1cv678"}
]])}
,69746:(e,t,a)=>{
"use strict";
a.d(t,{
A:()=>s}
);
let s=(0,a(56479).A)("loader-circle",[["path",{
d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}
]])}
,78773:(e,t,a)=>{
"use strict";
a.d(t,{
A:()=>s}
);
let s=(0,a(56479).A)("wifi-off",[["path",{
d:"M12 20h.01",key:"zekei9"}
],["path",{
d:"M8.5 16.429a5 5 0 0 1 7 0",key:"1bycff"}
],["path",{
d:"M5 12.859a10 10 0 0 1 5.17-2.69",key:"1dl1wf"}
],["path",{
d:"M19 12.859a10 10 0 0 0-2.007-1.523",key:"4k23kn"}
],["path",{
d:"M2 8.82a15 15 0 0 1 4.177-2.643",key:"1grhjp"}
],["path",{
d:"M22 8.82a15 15 0 0 0-11.288-3.764",key:"z3jwby"}
],["path",{
d:"m2 2 20 20",key:"1ooewy"}
]])}
}
,e=>{
e.O(0,[5730,7239,2619,3474,8673,9704,8441,1255,7358],()=>e(e.s=15169)),_N_E=e.O()}
]);
