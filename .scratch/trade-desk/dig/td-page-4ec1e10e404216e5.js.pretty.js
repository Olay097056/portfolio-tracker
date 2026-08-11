(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[2590],{
7550:(e,t,n)=>{
"use strict";
n.d(t,{
A:()=>r}
);
let r=(0,n(56479).A)("arrow-down",[["path",{
d:"M12 5v14",key:"s699le"}
],["path",{
d:"m19 12-7 7-7-7",key:"1idqje"}
]])}
,15307:(e,t,n)=>{
"use strict";
n.d(t,{
$m:()=>k,EA:()=>u,OV:()=>b,OW:()=>m,Pt:()=>p,Xb:()=>h,ZQ:()=>x,uA:()=>f,zY:()=>c,zk:()=>d}
);
var r=n(95155),a=n(78773),l=n(51606),i=n(40209),s=n(7550);
n(20467);
var o=n(93474);
function c(e){
let{
title:t,subtitle:n,right:a}
=e;
return(0,r.jsxs)("div",{
className:"mb-6 flex flex-wrap items-end justify-between gap-3",children:[(0,r.jsxs)("div",{
children:[(0,r.jsx)("h1",{
className:"text-xl font-bold tracking-tight",children:t}
),n&&(0,r.jsx)("p",{
className:"mt-1 text-sm text-ink-dim",children:n}
)]}
),a]}
)}
function d(e){
let{
state:t}
=e;
return(0,r.jsx)("span",{
className:"inline-block h-2 w-2 rounded-full ".concat("fresh"===t?"bg-emerald-400":"stale"===t?"bg-amber-400":"bg-red-400"," ").concat("fresh"===t?"pulse-dot":"")}
)}
function u(e){
let{
className:t=""}
=e;
return(0,r.jsx)("div",{
className:"skeleton ".concat(t)}
)}
function h(e){
let{
onRetry:t,message:n}
=e,{
t:i}
=(0,o.s)();
return(0,r.jsxs)("div",{
className:"panel flex flex-col items-center gap-3 p-10 text-center",children:[(0,r.jsx)(a.A,{
size:22,className:"text-ink-faint"}
),(0,r.jsx)("p",{
className:"text-sm text-ink-dim",children:n||i.loadError}
),t&&(0,r.jsxs)("button",{
onClick:t,className:"flex items-center gap-2 rounded-lg border border-edge px-4 py-2 text-xs font-medium text-ink-dim hover:border-accent/40 hover:text-ink",children:[(0,r.jsx)(l.A,{
size:12}
)," ",i.retry]}
)]}
)}
function m(e){
let{
data:t,width:n=60,height:a=22,strokeUp:l="#34d399",strokeDown:i="#f87171"}
=e,s=(null!=t?t:[]).filter(e=>Number.isFinite(e));
if(s.length<2)return(0,r.jsx)("div",{
style:{
width:n,height:a}
}
);
let o=Math.min(...s),c=Math.max(...s),d=c-o<1e-9,u=d?1:c-o,h=s.map((e,t)=>{
let r=t/(s.length-1)*(n-2)+1,l=d?a/2:a-2-(e-o)/u*(a-4);
return"".concat(r.toFixed(1),",").concat(l.toFixed(1))}
).join(" "),m=s[s.length-1]>=s[0];
return(0,r.jsx)("svg",{
width:n,height:a,className:d?"shrink-0 text-ink-faint":"shrink-0",children:(0,r.jsx)("polyline",{
points:h,fill:"none",stroke:d?"currentColor":m?l:i,strokeWidth:"1.5",strokeLinejoin:"round"}
)}
)}
function x(e){
let{
value:t}
=e;
return(0,r.jsxs)("div",{
className:"flex items-center gap-2",children:[(0,r.jsx)("div",{
className:"h-1.5 w-16 overflow-hidden rounded-full bg-panel-2",children:(0,r.jsx)("div",{
className:"h-full rounded-full ".concat(t>=70?"bg-emerald-400":t>=50?"bg-amber-400":"bg-red-400"),style:{
width:"".concat(Math.min(100,t),"%")}
}
)}
),(0,r.jsx)("span",{
className:"num text-xs text-ink-dim",children:Math.round(t)}
)]}
)}
function f(e){
let{
value:t,label:n,size:a=180,decimals:l=0,zones:i=[[0,25,"#ef4444"],[25,45,"#f59e0b"],[45,55,"#94a3b8"],[55,75,"#84cc16"],[75,100,"#10b981"]]}
=e,s=a/2,o=a/2,c=a/2-14,d=e=>Math.PI*(1-e/100),u=function(e){
let t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:c;
return{
x:s+t*Math.cos(d(e)),y:o-t*Math.sin(d(e))}
}
,h=u(Math.max(0,Math.min(100,t)),c-10);
return(0,r.jsxs)("svg",{
viewBox:"0 0 ".concat(a," ").concat(a/2+24),width:"100%",style:{
maxWidth:a}
,preserveAspectRatio:"xMidYMid meet",className:"overflow-visible",children:[i.map(e=>{
let[t,n,a]=e,l=u(t),i=u(n),s=+(n-t>50);
return(0,r.jsx)("path",{
d:"M ".concat(l.x," ").concat(l.y," A ").concat(c," ").concat(c," 0 ").concat(s," 1 ").concat(i.x," ").concat(i.y),fill:"none",stroke:a,strokeWidth:9,strokeLinecap:"butt",opacity:.85}
,"".concat(t,"-").concat(n))}
),(0,r.jsx)("line",{
x1:s,y1:o,x2:h.x,y2:h.y,stroke:"#e2e8f0",strokeWidth:2.5,strokeLinecap:"round"}
),(0,r.jsx)("circle",{
cx:s,cy:o,r:4.5,fill:"#e2e8f0"}
),(0,r.jsx)("text",{
x:s,y:o-c/2.4,textAnchor:"middle",className:"num",fill:"#f1f5f9",fontSize:a/7,fontWeight:700,children:l>0?t.toFixed(l):Math.round(t)}
),n&&(0,r.jsx)("text",{
x:s,y:o+20,textAnchor:"middle",fill:"#8b9bb4",fontSize:12,children:n}
)]}
)}
let g={
low:"bg-sky-500/15 text-sky-400 border-sky-500/30",medium:"bg-amber-500/15 text-amber-400 border-amber-500/30",high:"bg-orange-500/15 text-orange-400 border-orange-500/30",critical:"bg-red-500/15 text-red-400 border-red-500/30"}
;
function p(e){
var t;
let{
severity:n}
=e;
return(0,r.jsx)("span",{
className:"rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ".concat(null!=(t=g[n])?t:g.low),children:n}
)}
function b(e){
let{
score:t}
=e;
return(0,r.jsx)("span",{
className:"num rounded px-1.5 py-0.5 text-[11px] font-bold ".concat(t>=70?"bg-red-500/15 text-red-400":t>=45?"bg-orange-500/15 text-orange-400":t>=20?"bg-amber-500/15 text-amber-400":"bg-slate-600/20 text-slate-400"),children:Math.round(t)}
)}
function k(e){
let{
direction:t}
=e,n="long"===t;
return(0,r.jsxs)("span",{
className:"inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ".concat(n?"bg-emerald-500/15 text-emerald-400":"bg-red-500/15 text-red-400"),children:[n?(0,r.jsx)(i.A,{
size:11,strokeWidth:2.6}
):(0,r.jsx)(s.A,{
size:11,strokeWidth:2.6}
),t]}
)}
}
,20467:(e,t,n)=>{
"use strict";
function r(e){
let t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:2;
return null!=e&&Number.isFinite(e)?e.toLocaleString("en-US",{
minimumFractionDigits:t,maximumFractionDigits:t}
):"—"}
function a(e){
if(null==e||!Number.isFinite(e))return"—";
let t=Math.abs(e);
return t>=1e3?r(e,0):t>=10?r(e,2):r(e,4)}
function l(e){
let t=!(arguments.length>1)||void 0===arguments[1]||arguments[1];
if(null==e||!Number.isFinite(e))return"—";
let n=t&&e>0?"+":"";
return"".concat(n).concat(e.toFixed(2),"%")}
function i(e){
let t=!(arguments.length>1)||void 0===arguments[1]||arguments[1];
if(null==e||!Number.isFinite(e))return"—";
let n=t&&e>0?"+":"";
return"".concat(n).concat(e.toFixed(1),"bp")}
function s(e,t){
if(null==e)return"—";
switch(t){
case"%":return"".concat(r(e,3),"%");
case"bps":return"".concat(r(e,0)," bps");
case"$B":return"$".concat(r(e,1),"B");
case"USD":return"$".concat(a(e));
default:return a(e)}
}
function o(e){
var t;
let n=arguments.length>1&&void 0!==arguments[1]?arguments[1]:"realtime";
if(!e)return"old";
let r=(Date.now()-new Date(e).getTime())/36e5,a={
realtime:[2,24],daily:[30,96],sparse:[96,336],manual:[2880,9600]}
,[l,i]=null!=(t=a[n])?t:a.realtime;
return r<l?"fresh":r<i?"stale":"old"}
function c(e,t,n){
if(!n)return"old";
let r=e.toLowerCase(),a=(null!=t?t:"").toLowerCase(),l=(Date.now()-new Date(n).getTime())/864e5,[i,s]=/(_debt_gdp|_ca_gdp|_fiscal_deficit|_household_debt)$/.test(r)||/_rating_/.test(r)?[400,550]:/_policy_rate$/.test(r)?[75,130]:/(_cpi_yoy|_core_cpi|_pce_yoy)$/.test(r)||"inflation"===a?[50,85]:/(_reserves|_unemployment)$/.test(r)?[70,130]:"banking"===a||/^cot_/.test(r)||/_auction_btc$/.test(r)?[12,24]:"yield"===a||"fx"===a||"volatility"===a||"commodity"===a||"policy"===a||"credit"===a?[4,10]:[10,20];
return l<i?"fresh":l<s?"stale":"old"}
function d(e){
let t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:"th";
if(!e)return"—";
let n=Math.floor((Date.now()-new Date(e).getTime())/6e4);
if(n<1)return"th"===t?"เมื่อสักครู่":"just now";
if(n<60)return"th"===t?"".concat(n," นาทีที่แล้ว"):"".concat(n,"m ago");
let r=Math.floor(n/60);
if(r<24)return"th"===t?"".concat(r," ชม.ที่แล้ว"):"".concat(r,"h ago");
let a=Math.floor(r/24);
return"th"===t?"".concat(a," วันที่แล้ว"):"".concat(a,"d ago")}
n.d(t,{
I9:()=>o,PB:()=>s,SJ:()=>g,_E:()=>r,d7:()=>u,ex:()=>i,fF:()=>d,io:()=>c,o:()=>k,pT:()=>l,q_:()=>p,v7:()=>h,wY:()=>f,xe:()=>a}
);
let u=e=>null==e?"text-slate-500":e>0?"text-emerald-400":e<0?"text-red-400":"text-slate-400";
function h(e){
return e&&/^https?:\/\//i.test(e)?e:void 0}
let m="Asia/Bangkok",x=new Intl.DateTimeFormat("en-CA",{
timeZone:m,year:"numeric",month:"2-digit",day:"2-digit"}
);
function f(e){
let t=e instanceof Date?e:new Date(e);
return Number.isNaN(t.getTime())?"—":x.format(t)}
function g(){
let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:Date.now(),t=e+252e5,n=new Date(t).getUTCDay();
return new Date(t-(n+6)%7*864e5).toISOString().slice(0,10)}
function p(e,t,n){
if(null==e)return"—";
let r=new Date(e);
return Number.isNaN(r.getTime())?"—":r.toLocaleString("th"===t?"th-TH":"en-US",{
...n,timeZone:m}
)}
let b=new Intl.DateTimeFormat("sv-SE",{
timeZone:m,dateStyle:"short",timeStyle:"short"}
);
function k(e){
let t=e instanceof Date?e:new Date(e);
return Number.isNaN(t.getTime())?"—":b.format(t)}
}
,23916:(e,t,n)=>{
"use strict";
n.d(t,{
A:()=>r}
);
let r=(0,n(56479).A)("chevron-down",[["path",{
d:"m6 9 6 6 6-6",key:"qrunsl"}
]])}
,40209:(e,t,n)=>{
"use strict";
n.d(t,{
A:()=>r}
);
let r=(0,n(56479).A)("arrow-up",[["path",{
d:"m5 12 7-7 7 7",key:"hav0vg"}
],["path",{
d:"M12 19V5",key:"x0mq9r"}
]])}
,41316:(e,t,n)=>{
Promise.resolve().then(n.bind(n,95707))}
,51606:(e,t,n)=>{
"use strict";
n.d(t,{
A:()=>r}
);
let r=(0,n(56479).A)("refresh-cw",[["path",{
d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}
],["path",{
d:"M21 3v5h-5",key:"1q7to0"}
],["path",{
d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}
],["path",{
d:"M8 16H3v5",key:"1cv678"}
]])}
,62890:(e,t,n)=>{
"use strict";
n.d(t,{
ND:()=>c,VI:()=>d,m5:()=>u}
);
var r,a,l=n(58247),i=n(95704);
let s=null!=(r=i.env.NEXT_PUBLIC_SUPABASE_URL)?r:"https://vovprwjjauwqqiowwgqd.supabase.co",o=null!=(a=i.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?a:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvdnByd2pqYXV3cXFpb3d3Z3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4MzYwNzYsImV4cCI6MjA5OTQxMjA3Nn0.tzQD850ui-w8zPFwldzVXzMu5ERwlJvkwHleAvq7NII",c=(0,l.UU)(s,o,{
auth:{
persistSession:!0,autoRefreshToken:!0,detectSessionInUrl:!0,flowType:"pkce"}
}
),d=s,u=o}
,69746:(e,t,n)=>{
"use strict";
n.d(t,{
A:()=>r}
);
let r=(0,n(56479).A)("loader-circle",[["path",{
d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}
]])}
,76924:(e,t,n)=>{
"use strict";
n.d(t,{
A:()=>d,AuthProvider:()=>c}
);
var r,a=n(95155),l=n(12115),i=n(62890);
let s=(null!=(r=n(95704).env.NEXT_PUBLIC_ADMIN_EMAILS)?r:"natdanaic9510@gmail.com").split(",").map(e=>e.trim().toLowerCase()).filter(Boolean),o=(0,l.createContext)({
session:null,user:null,loading:!0,isAdmin:!1,isRoot:!1,banned:!1,needsOnboarding:!1,refreshProfile:()=>{
}
,signInWithGoogle:()=>{
}
,signOut:()=>{
}
}
);
function c(e){
var t,n,r,c;
let{
children:d}
=e,[u,h]=(0,l.useState)(null),[m,x]=(0,l.useState)(!0),[f,g]=(0,l.useState)(null),[p,b]=(0,l.useState)(!1);
(0,l.useEffect)(()=>{
i.ND.auth.getSession().then(e=>{
let{
data:t}
=e;
h(t.session),x(!1)}
);
let{
data:e}
=i.ND.auth.onAuthStateChange((e,t)=>{
h(t),x(!1)}
);
return()=>e.subscription.unsubscribe()}
,[]);
let k=null!=(r=null==u||null==(t=u.user)?void 0:t.id)?r:null,v=(0,l.useCallback)(async e=>{
let{
data:t}
=await i.ND.from("user_profiles").select("role, banned, onboarded_at").eq("user_id",e).maybeSingle();
return null!=t?t:null}
,[]);
(0,l.useEffect)(()=>{
if(!k){
g(null),b(!1);
return}
let e=!1;
return b(!1),v(k).then(t=>{
e||(g(t),b(!0))}
),()=>{
e=!0}
}
,[k,v]);
let y=(0,l.useCallback)(()=>{
k&&v(k).then(e=>g(e))}
,[k,v]),N=!!(null==u||null==(n=u.user)?void 0:n.email)&&s.includes(u.user.email.toLowerCase()),w=N||(null==f?void 0:f.role)==="admin"&&!(null==f?void 0:f.banned),j=!N&&(null==f?void 0:f.banned)===!0,M=!!u&&!N&&!j&&p&&!(null==f?void 0:f.onboarded_at);
return(0,a.jsx)(o.Provider,{
value:{
session:u,user:null!=(c=null==u?void 0:u.user)?c:null,loading:m,isAdmin:w,isRoot:N,banned:j,needsOnboarding:M,refreshProfile:y,signInWithGoogle:()=>{
i.ND.auth.signInWithOAuth({
provider:"google",options:{
redirectTo:"".concat(window.location.origin).concat(window.location.pathname)}
}
)}
,signOut:()=>{
i.ND.auth.signOut()}
}
,children:d}
)}
function d(){
return(0,l.useContext)(o)}
}
,78773:(e,t,n)=>{
"use strict";
n.d(t,{
A:()=>r}
);
let r=(0,n(56479).A)("wifi-off",[["path",{
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
,95707:(e,t,n)=>{
"use strict";
n.r(t),n.d(t,{
default:()=>c}
);
var r=n(95155),a=n(12115),l=n(51606),i=n(93474),s=n(15307),o=n(59704);
function c(){
let{
t:e,lang:t}
=(0,i.s)(),{
call:n,session:c,isAdmin:d,isRoot:u}
=(0,o.Cb)(),[h,m]=(0,a.useState)(""),[x,f]=(0,a.useState)(""),[g,p]=(0,a.useState)([]),[b,k]=(0,a.useState)([]),[v,y]=(0,a.useState)(null),[N,w]=(0,a.useState)(!1),[j,M]=(0,a.useState)(!1),[_,A]=(0,a.useState)(null),S=(0,a.useRef)(null),I=(0,a.useRef)({
page:-1,loading:!1,hasMore:!0,gen:0}
),D=(0,a.useCallback)(async(e,t)=>{
if(!c||!u)return;
let r=I.current;
if(r.loading)return;
r.loading=!0;
let a=r.gen;
w(!0),M(!1);
try{
var l,i,s;
let o=await n({
action:"get_signals",page:e,...h?{
team_id:h}
:{
}
,...x?{
status:x}
:{
}
}
);
if(I.current.gen!==a)return;
k(null!=(l=o.teams)?l:[]),y(null!=(i=o.total)?i:0),r.page=e,r.hasMore=(e+1)*15<(null!=(s=o.total)?s:0),p(e=>{
var n,r;
return t?null!=(n=o.signals)?n:[]:[...e,...null!=(r=o.signals)?r:[]]}
)}
catch(e){
I.current.gen===a&&M(!0)}
finally{
I.current.gen===a&&(r.loading=!1,w(!1))}
}
,[n,c,u,h,x]);
if((0,a.useEffect)(()=>{
let e=I.current;
e.gen++,e.loading=!1,e.hasMore=!0,e.page=-1,p([]),y(null),D(0,!0)}
,[D]),(0,a.useEffect)(()=>{
let e=S.current;
if(!e)return;
let t=new IntersectionObserver(e=>{
if(!e.some(e=>e.isIntersecting))return;
let t=I.current;
!t.loading&&t.hasMore&&D(t.page+1,!1)}
,{
rootMargin:"600px"}
);
return t.observe(e),()=>t.disconnect()}
,[D]),(0,a.useEffect)(()=>{
let e=S.current,t=I.current;
e&&!t.loading&&t.hasMore&&g.length&&e.getBoundingClientRect().top<=window.innerHeight+600&&D(t.page+1,!1)}
,[g,D]),!d)return null;
if(!u)return(0,r.jsxs)("div",{
className:"space-y-5",children:[(0,r.jsx)(o.EG,{
t:e}
),(0,r.jsx)(o.n,{
t:e}
)]}
);
let C=new Map(b.map(e=>[e.id,e.family])),E=(e,t,n,a)=>(0,r.jsxs)("button",{
onClick:n,className:"flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ".concat(e?"border-accent/50 bg-accent/10 text-accent":"border-edge text-ink-dim hover:text-ink"),children:[a&&(0,r.jsx)("span",{
className:"h-2 w-2 rounded-full",style:{
background:a}
}
),t]}
,t);
return(0,r.jsxs)("div",{
className:"space-y-4",children:[(0,r.jsx)(o.EG,{
t:e}
),(0,r.jsxs)("div",{
className:"flex items-start justify-between gap-2",children:[(0,r.jsx)(s.zY,{
title:e.tdMeetingsTitle}
),(0,r.jsxs)("button",{
onClick:()=>{
let e=I.current;
e.gen++,e.loading=!1,e.hasMore=!0,e.page=-1,p([]),y(null),D(0,!0)}
,disabled:N,className:"flex shrink-0 items-center gap-1.5 rounded-lg bg-panel-2 px-3 py-1.5 text-xs font-medium text-ink-dim hover:text-ink disabled:opacity-50",children:[(0,r.jsx)(l.A,{
size:13,className:N?"animate-spin":""}
),e.tdRefresh]}
)]}
),(0,r.jsxs)("p",{
className:"-mt-3 text-xs text-ink-faint",children:[e.tdMeetingsDesc,null!=v&&(0,r.jsxs)("span",{
className:"ml-2 tabular-nums",children:["\xb7 ",v]}
)]}
),(0,r.jsxs)("div",{
className:"flex flex-wrap items-center gap-1.5",children:[E(""===h,e.tdAllTeams,()=>m("")),b.map(e=>E(h===e.id,e.id,()=>m(h===e.id?"":e.id),o.T3[e.family])),(0,r.jsx)("span",{
className:"mx-1 h-4 w-px bg-edge"}
),E(""===x,e.tdAllStatus,()=>f("")),E("ok"===x,e.tdStatusOk,()=>f("ok"===x?"":"ok")),E("error"===x,e.tdStatusError,()=>f("error"===x?"":"error"))]}
),j&&(0,r.jsx)("div",{
className:"panel p-4 text-sm text-red-400",children:e.actionFailed}
),(0,r.jsxs)("div",{
className:"space-y-2",children:[g.map(n=>(0,r.jsx)(o.lr,{
s:n,family:C.get(n.team_id),open:_===n.id,onToggle:()=>A(_===n.id?null:n.id),t:e,lang:t}
,n.id)),!g.length&&!N&&(0,r.jsx)("div",{
className:"panel p-6 text-center text-xs text-ink-faint",children:e.tdNoSignals}
)]}
),(0,r.jsx)("div",{
ref:S}
),(0,r.jsx)("div",{
className:"flex justify-center pb-4",children:N?(0,r.jsx)("span",{
className:"text-xs text-ink-faint",children:"…"}
):I.current.hasMore&&g.length>0?(0,r.jsx)("button",{
onClick:()=>D(I.current.page+1,!1),className:"rounded-lg bg-panel-2 px-4 py-1.5 text-xs font-medium text-ink-dim hover:text-ink",children:e.tdLoadMore}
):g.length>0?(0,r.jsx)("span",{
className:"text-[11px] text-ink-faint",children:e.tdNoMore}
):null}
)]}
)}
}
}
,e=>{
e.O(0,[5730,7239,2619,3474,9704,8441,1255,7358],()=>e(e.s=41316)),_N_E=e.O()}
]);
