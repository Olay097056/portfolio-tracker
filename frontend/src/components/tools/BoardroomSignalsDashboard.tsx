import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBoardroomStances } from '../../api/client';
import type { BoardroomStance, BoardroomStancesPayload } from '../../api/types';

// ── palette (inline — ไม่มี Tailwind) ───────────────────────────────────────
const INK = {
  bg:'var(--bg)',
  panel:'var(--panel)',
  panel2: '#1a2332',
  border: '#263042',
  ink:'var(--text)',
  dim:'var(--text-muted)',
  faint:'var(--text-dim)',
  accent:'var(--primary)',
  emerald: '#34d399',
  red: '#f87171',
  amber: '#fbbf24',
  sky: '#38bdf8',
  violet: '#a78bfa',
};

const T = {
  title: 'สัญญาณจากที่ประชุม',
  subtitle: 'รวมจุดยืนทุกมติ — ราคาปัจจุบัน · P&L สด · นับถอยหลังจนครบกำหนด',
  tabActive: 'กำลังนับถอยหลัง',
  tabSettled: 'สรุปแล้ว',
  winRate: 'อัตราถูกทาง',
  pnlLive: 'P&L สด (ยังไม่ปิด)',
  pnlRealized: 'P&L สรุปแล้ว',
  avg: 'เฉลี่ย',
  equalWeight: 'รวมแบบน้ำหนักเท่ากันทุกสัญญาณ',
  groupPct: 'กลุ่มราคา (%)',
  groupPctDesc: 'ETF · ดัชนี · ทอง/น้ำมัน · FX — P&L คิดเป็น % จากราคาเข้า',
  groupBp: 'กลุ่ม Yield / สเปรด (bp)',
  groupBpDesc: 'พันธบัตรและสเปรดเครดิต วัดเป็น basis point (1bp = 0.01 จุด) — ป้ายทิศทางบอก "ยิลด์"/"สเปรด"',
  correct: 'ถูกทาง',
  wrong: 'ผิดทาง',
  push: 'เสมอ',
  remaining: 'เหลือ',
  awaiting: 'รอสรุปผล',
  unresolved: 'ตรวจไม่ได้ — ไม่มีราคา',
  flat: 'ราคายังไม่ขยับ',
  checks: 'จุดตรวจ:',
  checksNotDue: 'ยังไม่ถึงเวลา',
  checksSummary: 'สรุปผลจุดตรวจระหว่างทาง (+1/+3/+7 วัน)',
  checksDesc: 'วัดจากราคา ณ +1/+3/+7 วันหลังประชุม — ยังไม่ถึงเวลาแสดง "ยังไม่ถึงเวลา"',
  checksNone: 'ยังไม่ถึงเวลา',
  views: 'มุมมอง (ไม่เข้าบัญชี)',
  viewsDesc: 'stance ที่ความมั่นใจ <60 หรือมีนักวิเคราะห์หนุนอิสระ <2 คนตอนรอบวิเคราะห์อิสระ — ไม่เข้าสถิติ',
  trackRecord: 'สถิติรายสินทรัพย์ (ไว้เรียนรู้)',
  dd: 'ขาดทุนสูงสุดระหว่างทาง (max drawdown)',
  priceAt: 'ราคาตอนมติ',
  current: 'ราคาปัจจุบัน',
  dailyPrice: 'ราคารายวัน',
  dailyPriceTip: 'FRED อัปเดตวันละครั้ง — อาจเก่า 1 วันทำการ',
  toMeeting: 'ไปที่ประชุม',
  confidence: 'ความมั่นใจ',
  signed: 'เกิดสัญญาณ',
  firstDue: 'คิวแรกครบกำหนด',
  emptyAll: 'ยังไม่มีการประชุมที่ให้สัญญาณ',
  emptyActive: 'ยังไม่มีสัญญาณนับถอยหลัง',
  emptySettled: 'ยังไม่มีสัญญาณที่สรุปแล้ว',
  waitingData: 'รอข้อมูลเพิ่ม',
  coldStart: 'ยังสะสมสถิติไม่พอ — รอสัญญาณที่สรุปแล้วอย่างน้อย 10 รายการ',
  disclaimer: 'มุมมอง (ไม่เข้าบัญชี) — ข้อมูลเพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำการลงทุน ไม่ใช่ออเดอร์จริง',
  horizonDays: 'วัน',
  longWord: 'ทิศทางยิลด์/สเปรด',
  retry: 'ลองใหม่',
};

const YIELD_RE = /^(US|TH|JP|VN|FR|EA)\d{1,3}[YW]$/;

function isYield(asset: string): boolean {
  return YIELD_RE.test(asset.toUpperCase());
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const s = v > 0 ? `+${v.toFixed(digits)}` : v.toFixed(digits);
  return s;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${fmtNum(v)}%`;
}

function pnlColor(v: number | null | undefined): string {
  if (v === null || v === undefined) return INK.faint;
  if (v > 0) return INK.emerald;
  if (v < 0) return INK.red;
  return INK.faint;
}

function countdown(dueAt: string | null, now: number): string | null {
  if (!dueAt) return null;
  const diff = Date.parse(dueAt) - now;
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d >= 1) return `${d} วัน ${h} ชม.`;
  if (h >= 1) return `${h} ชม. ${m} น.`;
  return `${m} น.`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function checkIcon(c: { k: string; correct: boolean | null }): string {
  if (c.correct === true) return '✓';
  if (c.correct === false) return '✗';
  return '—';
}

function checkColor(c: { correct: boolean | null }): string {
  if (c.correct === true) return INK.emerald;
  if (c.correct === false) return INK.red;
  return INK.faint;
}

// ── สถานะ badge ────────────────────────────────────────────────────────────
function StateBadge({ s, now }: { s: BoardroomStance; now: number }) {
  if (s.state === 'settled') {
    const v = s.verdict;
    const color = v === 'win' ? INK.emerald : v === 'loss' ? INK.red : INK.faint;
    const label = v === 'win' ? `✓ ${T.correct}` : v === 'loss' ? `✗ ${T.wrong}` : `≈ ${T.push}`;
    return (
      <span style={{ border: `1px solid ${color}33`, background: `${color}1a`, color, borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 600 }}>
        {label}{s.pnl !== null ? ` ${fmtNum(s.pnl)}` : ''} · {s.horizon_days} {T.horizonDays}
      </span>
    );
  }
  if (s.state === 'pending') {
    const left = countdown(s.due_at, now);
    return (
      <span style={{ border: `1px solid ${INK.accent}33`, background: `${INK.accent}1a`, color: INK.accent, borderRadius: 999, padding: '2px 8px', fontSize: 10 }}>
        ⏳ {T.remaining} {left ?? '—'}
      </span>
    );
  }
  if (s.state === 'unresolved') {
    return (
      <span style={{ border: `1px solid ${INK.faint}44`, background: `${INK.faint}22`, color: INK.faint, borderRadius: 999, padding: '2px 8px', fontSize: 10 }}>
        {T.unresolved}
      </span>
    );
  }
  return (
    <span style={{ border: `1px solid ${INK.amber}44`, background: `${INK.amber}1a`, color: INK.amber, borderRadius: 999, padding: '2px 8px', fontSize: 10 }}>
      ⏳ {T.awaiting}
    </span>
  );
}

function DirectionBadge({ s }: { s: BoardroomStance }) {
  const up = s.direction === 'long';
  const color = up ? INK.emerald : INK.red;
  const sub = s.unit === 'bp' ? (isYield(s.asset) ? 'ยิลด์' : 'สเปรด') : '';
  return (
    <span style={{ color, border: `1px solid ${color}55`, borderRadius: 6, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
      {up ? 'LONG ↑' : 'SHORT ↓'}{sub ? ` ${sub}` : ''}
    </span>
  );
}

function UnitChip({ unit }: { unit: string }) {
  const bp = unit === 'bp';
  const c = bp ? INK.violet : INK.sky;
  return (
    <span style={{ color: c, border: `1px solid ${c}44`, background: `${c}11`, borderRadius: 4, padding: '0 5px', fontSize: 9, fontWeight: 600 }}>
      {bp ? 'bp' : '%'}
    </span>
  );
}

function ChecksRow({ s }: { s: BoardroomStance }) {
  if (!s.checks || s.checks.length === 0) return null;
  return (
    <div style={{ fontSize: 9, color: INK.faint, marginTop: 5 }} title={T.checksDesc}>
      {T.checks}{' '}
      {s.checks.map((c) => (
        <span key={c.k} style={{ color: checkColor(c), marginRight: 6 }}>
          {c.k}{checkIcon(c)}
        </span>
      ))}
      {s.checks.some((c) => c.correct === null) && (
        <span style={{ color: INK.faint }}>· {T.checksNone}</span>
      )}
    </div>
  );
}

// ── การ์ดสัญญาณ ────────────────────────────────────────────────────────────
function SignalCard({ s, now, onGoMeeting }: { s: BoardroomStance; now: number; onGoMeeting: (id: string) => void }) {
  const pnl = s.pnl;
  const dirColor = s.direction === 'long' ? INK.emerald : INK.red;
  const flat = s.state === 'pending' && s.pnl === 0;
  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderLeft: `3px solid ${dirColor}99`, borderRadius: 8, padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: INK.ink }}>{s.asset}</span>
          <DirectionBadge s={s} />
          {s.consensus === 'unanimous' && <span style={{ fontSize: 11 }}>🤝</span>}
          {s.consensus === 'contested' && <span style={{ fontSize: 11 }}>⚔️</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <UnitChip unit={s.unit} />
          <span style={{ fontSize: 9, color: INK.faint }}>P&L</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: pnlColor(pnl) }}>{fmtNum(pnl)}{s.unit === 'bp' ? '' : '%'}</span>
        <span style={{ fontSize: 10, color: INK.faint }}>
          {fmtNum(s.price_at, 2)}{s.unit === 'bp' ? '' : ''} → {s.current !== null && s.current !== undefined ? fmtNum(s.current, 2) : '—'}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <StateBadge s={s} now={now} />
        {flat && (
          <span style={{ border: `1px solid ${INK.border}`, background: INK.panel2, color: INK.faint, borderRadius: 999, padding: '2px 8px', fontSize: 10 }}>
            ⏸ {T.flat}
          </span>
        )}
        {s.unit === 'bp' && (
          <span title={T.dailyPriceTip} style={{ color: INK.faint, border: `1px solid ${INK.border}`, borderRadius: 999, padding: '2px 8px', fontSize: 9 }}>
            {T.dailyPrice}
          </span>
        )}
        {s.unit_mismatch && (
          <span title="AI เขียนหน่วยไม่ตรงกับชื่อสินทรัพย์ — ระบบใช้หน่วยที่deriveจากชื่อ" style={{ color: INK.amber, fontSize: 9 }}>⚠️ unit</span>
        )}
      </div>
      <ChecksRow s={s} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8, fontSize: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: INK.faint }}>{T.priceAt}</div>
          <div style={{ color: INK.ink }}>{fmtNum(s.price_at, 2)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: INK.faint }}>{T.current}</div>
          <div style={{ color: INK.ink }}>{s.current !== null && s.current !== undefined ? fmtNum(s.current, 2) : '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: INK.faint }}>{T.dd}</div>
          <div style={{ color: s.dd === null ? INK.faint : pnlColor(s.dd) }}>{s.dd === null ? '—' : fmtPct(s.dd)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <div style={{ fontSize: 9, color: INK.faint }}>
          {T.confidence} <b style={{ color: INK.dim }}>{s.confidence ?? '—'}%</b>
          {' · '}{T.signed} {fmtDate(s.started_at)}
        </div>
        <button
          onClick={() => onGoMeeting(s.meeting_id)}
          style={{ background: 'none', border: 'none', color: INK.accent, fontSize: 10, cursor: 'pointer', padding: 0 }}
        >
          {T.toMeeting} →
        </button>
      </div>
    </div>
  );
}

// ── สถิติ ───────────────────────────────────────────────────────────────────
function StatCell({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 10, color: INK.faint }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: INK.ink, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: INK.faint, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function PnlAvgRow({ unit, value, n }: { unit: string; value: number | null; n: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <UnitChip unit={unit} />
      <span style={{ fontWeight: 700, fontSize: 13, color: pnlColor(value) }}>{fmtNum(value)}{unit === 'bp' ? '' : '%'}</span>
      {n > 0 && <span style={{ fontSize: 9, color: INK.faint }}>({T.avg} · {n})</span>}
    </div>
  );
}

function WinRateValue({ s }: { s: BoardroomStanceStatsLike }) {
  if (s.cold_start) return 'รอข้อมูลเพิ่ม';
  if (s.win_rate === null) return '—';
  return `${s.win_rate}%`;
}

interface BoardroomStanceStatsLike {
  cold_start: boolean;
  win_rate: number | null;
  wins: number;
  losses: number;
  pushes: number;
  n: number;
  pnl_live: { pct: number | null; bp: number | null; pct_n: number; bp_n: number };
  pnl_realized: { pct: number | null; bp: number | null; pct_n: number; bp_n: number };
  track_record: { asset: string; unit: string; wins: number; losses: number; pushes: number; win_pct: number | null; avg: number | null }[];
  checks_summary: { k: string; judged: number; pct: number | null; wins: number }[];
  pending_count: number;
  settled_count: number;
}

// ── แดชบอร์ดหลัก ───────────────────────────────────────────────────────────
interface Props {
  onGoMeeting?: (meetingId: string) => void;
}

export function BoardroomSignalsDashboard({ onGoMeeting }: Props) {
  const [data, setData] = useState<BoardroomStancesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'settled'>('active');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const d = await getBoardroomStances();
      setData(d);
      setError(null);
    } catch {
      setError('โหลดข้อมูลไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 90000); // refresh 90s (ตามต้นฉบับ)
    const tick = setInterval(() => setNow(Date.now()), 30000); // นับถอยหลัง 30s
    return () => {
      clearInterval(iv);
      clearInterval(tick);
    };
  }, [load]);

  const goMeeting = useCallback((id: string) => {
    if (onGoMeeting) onGoMeeting(id);
  }, [onGoMeeting]);

  const view = useMemo(() => {
    if (!data) return null;
    const all = data.stances;
    const booked = all.filter((s) => s.qualified);
    const views = all.filter((s) => !s.qualified);
    const settled = booked.filter((s) => s.state === 'settled');
    const active = booked.filter((s) => s.state !== 'settled');
    const list = tab === 'settled' ? settled : active;
    const byUnit = (rows: BoardroomStance[]) => {
      const pct = rows.filter((s) => s.unit === 'pct');
      const bp = rows.filter((s) => s.unit === 'bp');
      return [
        { unit: 'pct', rows: pct },
        { unit: 'bp', rows: bp },
      ].filter((g) => g.rows.length > 0);
    };
    return { all, booked, views, settled, active, list, byUnit: byUnit(list) };
  }, [data, tab]);

  if (error && !data) {
    return (
      <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: INK.ink }}>{T.title}</div>
        <div style={{ color: INK.red, marginTop: 8, fontSize: 12 }}>{error}</div>
        <button onClick={load} style={{ marginTop: 8, background: INK.panel2, color: INK.ink, border: `1px solid ${INK.border}`, borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer' }}>{T.retry}</button>
      </div>
    );
  }

  if (!data || !view) {
    return <div style={{ color: INK.faint, fontSize: 12, padding: 20 }}>กำลังโหลด…</div>;
  }

  const st = data.stats;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: INK.ink }}>🏛️ {T.title}</div>
          <div style={{ fontSize: 11, color: INK.faint, marginTop: 2 }}>{T.subtitle}</div>
        </div>
      </div>

      {/* แถบสถิติ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 12 }}>
        <StatCell
          label={T.tabActive}
          value={`${st.pending_count}`}
          sub={`${st.settled_count} ${T.tabSettled}`}
        />
        <StatCell
          label={T.winRate}
          value={<WinRateValue s={st} />}
          sub={st.cold_start ? T.coldStart : `${st.wins}W / ${st.losses}L${st.pushes ? ` / ≈${st.pushes} ${T.push}` : ''}`}
        />
        <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 8, padding: 10 }} title={T.equalWeight}>
          <div style={{ fontSize: 10, color: INK.faint }}>{T.pnlLive}</div>
          <PnlAvgRow unit="pct" value={st.pnl_live.pct} n={st.pnl_live.pct_n} />
          <PnlAvgRow unit="bp" value={st.pnl_live.bp} n={st.pnl_live.bp_n} />
        </div>
        <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 8, padding: 10 }} title={T.equalWeight}>
          <div style={{ fontSize: 10, color: INK.faint }}>{T.pnlRealized}</div>
          <PnlAvgRow unit="pct" value={st.pnl_realized.pct} n={st.pnl_realized.pct_n} />
          <PnlAvgRow unit="bp" value={st.pnl_realized.bp} n={st.pnl_realized.bp_n} />
        </div>
      </div>

      {/* แท็บ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 4, background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 8, padding: 3 }}>
          {(['active', 'settled'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? INK.panel2 : 'none',
                color: tab === t ? INK.ink : INK.faint,
                border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer',
              }}
            >
              {t === 'active' ? T.tabActive : T.tabSettled}
            </button>
          ))}
        </div>
      </div>

      {/* รายการ */}
      {view.list.length === 0 ? (
        <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 10, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: INK.dim }}>
            {tab === 'settled' ? T.emptySettled : T.emptyActive}
          </div>
          <div style={{ fontSize: 10, color: INK.faint, marginTop: 6 }}>
            {T.checksSummary} — {T.checksNotDue} · {T.firstDue}
          </div>
        </div>
      ) : (
        view.byUnit.map((g) => {
          const bp = g.unit === 'bp';
          const c = bp ? INK.violet : INK.sky;
          return (
            <section key={g.unit} style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${c}44`, color: c, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: c }} />
                  {bp ? T.groupBp : T.groupPct}
                  <b style={{ color: INK.ink }}>{g.rows.length}</b>
                </span>
                <span style={{ fontSize: 10, color: INK.faint }}>{bp ? T.groupBpDesc : T.groupPctDesc}</span>
              </div>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {g.rows.map((s) => (
                  <SignalCard key={s.id} s={s} now={now} onGoMeeting={goMeeting} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {/* มุมมอง (ไม่เข้าบัญชี) */}
      {view.views.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: INK.dim, marginBottom: 4 }}>👁️ {T.views} <span style={{ color: INK.faint }}>({view.views.length})</span></h3>
          <p style={{ fontSize: 10, color: INK.faint, marginBottom: 8 }}>{T.viewsDesc}</p>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {view.views.slice(0, 12).map((s) => (
              <SignalCard key={s.id} s={s} now={now} onGoMeeting={goMeeting} />
            ))}
          </div>
        </section>
      )}

      {/* สรุปจุดตรวจ */}
      {st.checks_summary.some((c) => c.judged > 0) && (
        <section style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: INK.dim, marginBottom: 8 }}>{T.checksSummary}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            {st.checks_summary.map((c) => (
              <div key={c.k} style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 10, color: INK.faint }}>+{c.k.slice(1)} {T.horizonDays}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: INK.ink, marginTop: 2 }}>
                  {c.judged === 0 ? '—' : c.judged < 10 ? T.waitingData : `${c.pct}%`}
                </div>
                <div style={{ fontSize: 9, color: INK.faint, marginTop: 2 }}>
                  {c.judged === 0 ? T.checksNotDue : c.judged < 10 ? `${c.wins}W / ${c.judged - c.wins}L` : `${c.wins}W / ${c.judged - c.wins}L`}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10, color: INK.faint, marginTop: 6 }}>{T.checksDesc}</p>
        </section>
      )}

      {/* สถิติรายสินทรัพย์ */}
      {st.track_record.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: INK.dim, marginBottom: 8 }}>📊 {T.trackRecord}</h3>
          <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 10, overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 420, borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${INK.border}`, fontSize: 10, color: INK.faint }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500 }}>{'สินทรัพย์'}</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500 }}>W/L</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500 }}>{T.winRate}</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500 }}>P&L avg</th>
                </tr>
              </thead>
              <tbody>
                {(['pct', 'bp'] as const).map((unit) => {
                  const rows = st.track_record.filter((r) => r.unit === unit);
                  if (!rows.length) return null;
                  const c = unit === 'bp' ? INK.violet : INK.sky;
                  return (
                    <tr key={unit}>
                      <td colSpan={4} style={{ padding: '6px 12px', background: `${INK.panel2}88`, fontSize: 10, fontWeight: 600, color: c }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 99, background: c }} />
                          {unit === 'bp' ? T.groupBp : T.groupPct}
                        </span>
                      </td>
                    </tr>
                  );
                }).concat(
                  st.track_record.map((r) => (
                    <tr key={r.asset} style={{ borderBottom: `1px solid ${INK.border}44` }}>
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: INK.ink }}>{r.asset} <UnitChip unit={r.unit} /></td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: INK.dim }}>
                        <span style={{ color: INK.emerald }}>{r.wins}</span>/{r.losses}
                        {r.pushes > 0 && <span style={{ color: INK.faint }}> ≈{r.pushes}</span>}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: INK.ink }}>
                        {r.win_pct === null ? '—' : `${r.win_pct}%`}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: pnlColor(r.avg) }}>
                        {r.avg === null ? '—' : `${fmtNum(r.avg)}${r.unit === 'bp' ? '' : '%'}`}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p style={{ fontSize: 9, color: INK.faint, marginTop: 14 }}>
        {T.disclaimer}
      </p>
    </div>
  );
}

export default BoardroomSignalsDashboard;
