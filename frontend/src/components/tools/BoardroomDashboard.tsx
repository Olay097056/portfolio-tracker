import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createBoardroomMeeting,
  getBoardroomMeeting,
  listBoardroomMeetings,
  resumeBoardroomMeeting,
} from '../../api/client';
import type {
  BoardroomClaim,
  BoardroomMeeting,
  BoardroomMeetingDetail,
  BoardroomSeat,
} from '../../api/types';

// Ink palette (project-wide, no Tailwind — same as the other tool dashboards)
const INK = {
  bg: '#0a0e14',
  panel: '#111722',
  panel2: '#0d1320',
  border: '#1f2937',
  ink: '#e2e8f0',
  dim: '#8b9bb4',
  faint: '#64748b',
  accent: '#38bdf8',
  emerald: '#34d399',
  red: '#f87171',
  amber: '#f59e0b',
  orange: '#fb923c',
  violet: '#a78bfa',
  yellow: '#fbbf24',
} as const;

// ── Thai copy (จาก i18n ต้นฉบับ — ticket 01) ─────────────────────────────
const T = {
  title: 'ห้องประชุม AI',
  subtitle: 'ทีม AI หลายโมเดลหลายค่ายโต้แย้งกันเพื่อหาความจริง — ยอมรับเฉพาะข้อสรุปที่ผ่านการพิสูจน์ด้วยหลักฐาน',
  live: 'กำลังประชุมสด',
  archive: 'การประชุมย้อนหลัง',
  openMeeting: 'เปิดประชุม',
  agendaPlaceholder: "พิมพ์วาระ/โจทย์ให้ทีม AI ไปหาข้อมูลมาถกกัน เช่น 'ทองคำจะไปต่อไหมหลัง CPI ออก'...",
  starting: 'กำลังรีเฟรชข้อมูลและเปิดประชุม...',
  meetingRunning: 'มีการประชุมกำลังดำเนินอยู่ — ต้องรอให้จบก่อน',
  watchLive: 'เข้าดูสด',
  resume: 'ประชุมต่อ',
  resuming: 'กำลังเปิดต่อ…',
  calls: 'เรียก AI',
  speaking: 'กำลังพูด...',
  waitingNext: 'รอผู้พูดคนถัดไป...',
  resolution: 'มติที่ประชุม',
  byJames: 'สรุปโดย เจมส์ (CEO) จากข้อสรุปที่ผ่านการพิสูจน์เท่านั้น',
  plainProven: 'ข้อสรุปที่พิสูจน์แล้ว',
  plainUnproven: 'ข้อที่ยังฟันธงไม่ได้',
  plainWatch: 'จับตา',
  plainOutlook: 'คาดการณ์อนาคต',
  fullAnalysis: 'ฉบับวิเคราะห์เต็ม (มีอ้างอิง)',
  stances: 'จุดยืนรายสินทรัพย์',
  verification: 'ผลตรวจสอบข้อกล่าวอ้าง',
  insufficient: 'ยังฟันธงไม่ได้',
  claimVerified: 'ผ่านการพิสูจน์',
  claimFailed: 'ขัดกับข้อมูลจริง',
  claimUnverified: 'ตรวจไม่ได้',
  transcript: 'บทสนทนาการประชุม',
  seats: 'ที่นั่งในห้องประชุม',
  back: '← กลับรายการ',
  disclaimer: 'ข้อมูลเพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำการลงทุน',
  empty: 'ยังไม่มีการประชุม — ระบบจะเปิดวาระเองเมื่อมีข่าวแรง หรือตัวเลขโมเดลขยับ',
  minutesAgo: 'นาทีที่แล้ว',
  hoursAgo: 'ชม.ที่แล้ว',
  daysAgo: 'วันที่แล้ว',
  justNow: 'เมื่อสักครู่',
  meetingSeats: 'ที่นั่งในประชุมนี้',
  claimStatsTitle: 'สถิติข้อกล่าวอ้าง (ประชุมนี้)',
  claimStatsHint: 'สถิติรวมทุกประชุมจะมาในหน้าสถิติ — ตรงนี้แสดงเฉพาะประชุมที่เลือก (นับเฉพาะข้อกล่าวอ้างที่ตรวจด้วยโค้ด ไม่รวมความเห็น)',
  waitingData: 'รอข้อมูลเพิ่ม',
  modeFull: 'เต็ม',
  modeShort: 'สั้น',
  phaseLabel: 'เฟส',
  horizonShort: 'ระยะสั้น',
  horizonMedium: 'ระยะกลาง',
  horizonLong: 'ระยะยาว',
  daysUnit: 'วัน',
  consensusUnanimous: 'เห็นตรงกันตั้งแต่รอบวิเคราะห์อิสระ',
  consensusContested: 'เห็นต่างตอนต้น เคาะหลังโต้แย้ง',
};

const PHASES: { key: string; label: string }[] = [
  { key: 'opening', label: 'เปิดวาระ' },
  { key: 'research', label: 'วิจัยภายนอก' },
  { key: 'briefing', label: 'นำเสนอ' },
  { key: 'debate_r1', label: 'โต้แย้ง' },
  { key: 'debate_r2', label: 'โต้แย้ง รอบ 2' },
  { key: 'verification', label: 'ตรวจสอบ' },
  { key: 'evidence', label: 'หาหลักฐานเพิ่ม' },
  { key: 'external_data', label: 'ตรวจตัวเลขภายนอก' },
  { key: 'resolution', label: 'ลงมติ' },
];

const PHASE_LABEL: Record<string, string> = Object.fromEntries(PHASES.map((p) => [p.key, p.label]));

const STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  running: { label: 'กำลังประชุม', color: INK.accent, bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.5)' },
  completed: { label: 'เสร็จสิ้น', color: INK.emerald, bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.4)' },
  failed: { label: 'ล้มเหลว', color: INK.red, bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.4)' },
  cancelled: { label: 'ยกเลิก', color: INK.faint, bg: 'transparent', border: INK.border },
};

const TRIGGER: Record<string, string> = {
  manual: 'เปิดโดยแอดมิน',
  news: 'เปิดจากข่าว',
  model: 'เปิดจากโมเดลขยับ',
  calendar: 'เปิดจากข่าวแดง',
};

const VERDICT: Record<string, { label: string; color: string; bg: string; border: string }> = {
  verified: { label: 'ผ่านการพิสูจน์', color: INK.emerald, bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.4)' },
  partial: { label: 'ทิศทางถูก-ขนาดคลาดเคลื่อน', color: INK.amber, bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)' },
  failed: { label: 'ขัดกับข้อมูลจริง', color: INK.red, bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.4)' },
  unverifiable: { label: 'ตรวจไม่ได้', color: INK.faint, bg: 'transparent', border: INK.border },
};

const SEAT_COLORS: Record<string, string> = {
  ceo: INK.yellow, scout: '#22d3ee', macro: INK.accent, credit: INK.emerald,
  technical: INK.violet, challenger_a: INK.red, challenger_b: INK.orange,
};

// ── helpers ────────────────────────────────────────────────────────────────
function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return T.justNow;
  if (diffMin < 60) return `${diffMin} ${T.minutesAgo}`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h} ${T.hoursAgo}`;
  return `${Math.floor(h / 24)} ${T.daysAgo}`;
}

function fmtTokens(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
}

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

interface Stance {
  asset: string;
  stance: string;
  confidence?: number;
  horizon?: string;
  horizon_days?: number;
  price_at?: number;
  reason?: string;
}

interface ResolutionJson {
  plain?: { summary?: string; proven?: string[]; unproven?: string[]; watch?: string[]; outlook?: string };
  claim_summary?: { verified?: number; failed?: number; unverified?: number };
  stances?: Stance[];
  verification?: { claim?: string; verdict?: string }[];
  watchlist?: string[];
}

// minimal markdown → JSX (subset the model actually writes)
function Md({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    const s = line.trim();
    if (!s) { i += 1; continue; }
    if (s.startsWith('|') && i + 1 < lines.length && /^[\s|:\-]+$/.test(lines[i + 1].trim())) {
      const header = s.slice(1, -1).split('|').map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].slice(1, -1).split('|').map((c) => c.trim()));
        i += 1;
      }
      out.push(
        <table key={key++} style={{ borderCollapse: 'collapse', margin: '8px 0', fontSize: 12, width: '100%' }}>
          <thead>
            <tr>{header.map((h, hi) => <th key={hi} style={{ border: `1px solid ${INK.border}`, background: INK.panel2, color: '#7dd3fc', padding: '5px 8px', textAlign: 'left' }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ border: `1px solid ${INK.border}`, padding: '5px 8px' }}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    if (s.startsWith('### ')) { out.push(<h4 key={key++} style={{ margin: '10px 0 4px', fontSize: 13, color: '#93c5fd' }}>{s.slice(4)}</h4>); i += 1; continue; }
    if (s.startsWith('## ')) { out.push(<h3 key={key++} style={{ margin: '10px 0 4px', fontSize: 14, color: INK.yellow }}>{s.slice(3)}</h3>); i += 1; continue; }
    if (s.startsWith('# ')) { out.push(<h2 key={key++} style={{ margin: '10px 0 4px', fontSize: 15, color: INK.yellow }}>{s.slice(2)}</h2>); i += 1; continue; }
    if (s.startsWith('> ')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) { buf.push(lines[i].trim().slice(2)); i += 1; }
      out.push(<blockquote key={key++} style={{ borderLeft: `3px solid ${INK.amber}`, margin: '8px 0', padding: '2px 10px', color: '#fcd34d', background: '#1c1917', borderRadius: '0 6px 6px 0' }}>{buf.join('\n')}</blockquote>);
      continue;
    }
    if (/^[-*] /.test(s)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) { items.push(lines[i].trim().slice(2)); i += 1; }
      out.push(<ul key={key++} style={{ margin: '6px 0', paddingLeft: 22 }}>{items.map((it, ii) => <li key={ii} style={{ margin: '2px 0' }}>{it}</li>)}</ul>);
      continue;
    }
    if (/^\d+\.\s/.test(s)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s/, '')); i += 1; }
      out.push(<ol key={key++} style={{ margin: '6px 0', paddingLeft: 22 }}>{items.map((it, ii) => <li key={ii} style={{ margin: '2px 0' }}>{it}</li>)}</ol>);
      continue;
    }
    const para: string[] = [s];
    i += 1;
    while (i < lines.length && lines[i].trim() && !['#', '|', '>', '- ', '* '].some((p) => lines[i].trim().startsWith(p)) && !/^\d+\.\s/.test(lines[i].trim()) && !lines[i].trim().startsWith('```')) {
      para.push(lines[i].trim());
      i += 1;
    }
    out.push(<p key={key++} style={{ margin: '4px 0' }}>{para.join('\n')}</p>);
  }
  return <div style={{ whiteSpace: 'pre-wrap' }}>{out}</div>;
}

// ── small pieces ───────────────────────────────────────────────────────────
function Badge({ label, color, bg, border, title }: { label: string; color: string; bg: string; border: string; title?: string }) {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, border: `1px solid ${border}`, background: bg, color, padding: '1px 8px', fontSize: 10, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.cancelled;
  return <Badge label={s.label} color={s.color} bg={s.bg} border={s.border} />;
}

function TriggerBadge({ trigger }: { trigger: string }) {
  return <span style={{ fontSize: 10, color: INK.faint }}>{TRIGGER[trigger] ?? trigger}</span>;
}

function FilterChip({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        cursor: 'pointer', fontSize: 11, borderRadius: 999, padding: '2px 10px',
        color: active ? color : INK.faint,
        background: active ? 'rgba(148,163,184,0.12)' : 'transparent',
        border: `1px solid ${active ? color : INK.border}`,
      }}
    >
      {label}
    </button>
  );
}

function StanceBadge({ stance, asset }: { stance: string; asset: string }) {
  const dir = (stance ?? '').toLowerCase();
  const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
    long: { label: 'LONG ↑', color: INK.emerald, bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.4)' },
    short: { label: 'SHORT ↓', color: INK.red, bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.4)' },
    neutral: { label: 'NEUTRAL', color: INK.accent, bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.4)' },
  };
  const m = map[dir] ?? { label: T.insufficient, color: INK.amber, bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)' };
  return <Badge label={`${asset} ${m.label}`} color={m.color} bg={m.bg} border={m.border} />;
}

function ClaimBadge({ claim }: { claim: BoardroomClaim }) {
  const v = VERDICT[claim.verdict] ?? VERDICT.unverifiable;
  const icon = claim.verdict === 'verified' ? '✓' : claim.verdict === 'failed' ? '✗' : claim.verdict === 'partial' ? '🔶' : '?';
  return (
    <span title={claim.reason ?? undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', borderRadius: 999, border: `1px solid ${v.border}`, background: v.bg, color: v.color, padding: '1px 8px', fontSize: 10 }}>
      <b>{icon}</b>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{claim.claim_text}</span>
    </span>
  );
}

function SeatChip({ seat, speaking }: { seat: BoardroomSeat; speaking: boolean }) {
  const color = SEAT_COLORS[seat.seat_id] ?? INK.faint;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 92, opacity: seat.enabled ? 1 : 0.35, textAlign: 'center' }}>
      <div style={{ width: 34, height: 34, borderRadius: '50%', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: INK.panel2, boxShadow: speaking ? `0 0 0 3px ${color}55` : undefined }}>
        {seat.position_key === 'ceo' ? '👑' : seat.position_key === 'research' ? '🔭' : seat.position_key === 'challenger' ? '⚔️' : '💼'}
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: INK.ink }}>{seat.name_th}</div>
      <div style={{ fontSize: 8, color: INK.faint }}>{seat.model}</div>
    </div>
  );
}

// ── resolution block ───────────────────────────────────────────────────────
function Resolution({ detail }: { detail: BoardroomMeetingDetail }) {
  const rj = parseJson<ResolutionJson>(detail.resolution_json, {});
  const plain = rj.plain ?? {};
  const stances = rj.stances ?? [];
  const verification = rj.verification ?? [];
  const cs = rj.claim_summary ?? {};
  const horizonLabel = (h?: string) => (h === 'short' ? T.horizonShort : h === 'medium' ? T.horizonMedium : h === 'long' ? T.horizonLong : h ?? '');
  return (
    <div style={{ background: INK.panel, border: '1px solid rgba(251,191,36,0.25)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 14, color: INK.yellow }}>👑 {T.resolution}</h3>
        {(cs.verified || cs.failed || cs.unverified) && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: INK.faint }}>
            claims: <span style={{ color: INK.emerald }}>{cs.verified ?? 0}✓</span>{' '}
            <span style={{ color: INK.red }}>{cs.failed ?? 0}✗</span>{' '}
            <span style={{ color: INK.dim }}>{cs.unverified ?? 0}?</span>
          </span>
        )}
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 10, color: INK.faint }}>{T.byJames}</p>
      {plain.summary && <p style={{ fontSize: 13, lineHeight: 1.6, color: INK.ink, marginTop: 12 }}>{plain.summary}</p>}
      {!!plain.proven?.length && (
        <div style={{ marginTop: 10 }}>
          <h4 style={{ fontSize: 12, color: INK.emerald, margin: '0 0 4px' }}>✅ {T.plainProven}</h4>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: INK.dim, lineHeight: 1.6 }}>{plain.proven.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {!!plain.unproven?.length && (
        <div style={{ marginTop: 10 }}>
          <h4 style={{ fontSize: 12, color: INK.amber, margin: '0 0 4px' }}>⚖️ {T.plainUnproven}</h4>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: INK.dim, lineHeight: 1.6 }}>{plain.unproven.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {!!plain.watch?.length && (
        <div style={{ marginTop: 10 }}>
          <h4 style={{ fontSize: 12, color: INK.accent, margin: '0 0 4px' }}>👀 {T.plainWatch}</h4>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: INK.dim, lineHeight: 1.6 }}>{plain.watch.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {plain.outlook && (
        <div style={{ marginTop: 10, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 8, padding: '8px 10px' }}>
          <h4 style={{ fontSize: 12, color: '#c4b5fd', margin: '0 0 4px' }}>🔮 {T.plainOutlook}</h4>
          <p style={{ margin: 0, fontSize: 12, color: INK.dim, lineHeight: 1.6 }}>{plain.outlook}</p>
        </div>
      )}
      {stances.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ fontSize: 12, color: INK.dim, margin: '0 0 6px' }}>{T.stances}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 8 }}>
            {stances.map((st, i) => (
              <div key={i} style={{ background: INK.panel2, border: `1px solid ${INK.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <b style={{ fontSize: 12 }}>{st.asset}</b>
                  <StanceBadge stance={st.stance} asset={st.asset} />
                </div>
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 10, color: INK.faint }}>
                  {st.confidence != null && <span>ความมั่นใจ <b style={{ color: INK.dim }}>{st.confidence}%</b></span>}
                  {st.horizon && st.horizon_days != null && <span>{horizonLabel(st.horizon)} {st.horizon_days} {T.daysUnit}</span>}
                  {st.price_at != null && <span>ราคา ณ วิเคราะห์: <b style={{ color: INK.dim }}>{st.price_at}</b></span>}
                </div>
                {st.reason && <p style={{ margin: '6px 0 0', fontSize: 11, color: INK.dim, lineHeight: 1.5 }}>{st.reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {verification.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ fontSize: 12, color: INK.dim, margin: '0 0 6px' }}>{T.verification}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {verification.map((v, i) => {
              const ok = v.verdict === 'true';
              const unknown = v.verdict !== 'true' && v.verdict !== 'false';
              const color = ok ? INK.emerald : unknown ? INK.amber : INK.red;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11 }}>
                  <span style={{ color, fontWeight: 700 }}>{ok ? '✓' : unknown ? '?' : '✗'}</span>
                  <span style={{ color: INK.dim }}>{v.claim}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: INK.faint }}>
                    {ok ? T.claimVerified : unknown ? T.claimUnverified : T.claimFailed}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {detail.resolution_md && (
        <details style={{ marginTop: 12, border: `1px solid ${INK.border}`, borderRadius: 8, background: INK.panel2 }}>
          <summary style={{ cursor: 'pointer', padding: '8px 12px', fontSize: 12, color: INK.dim, fontWeight: 600 }}>🔬 {T.fullAnalysis}</summary>
          <div style={{ padding: '4px 12px 12px', fontSize: 12, color: INK.dim, lineHeight: 1.6 }}>
            <Md text={detail.resolution_md} />
          </div>
        </details>
      )}
    </div>
  );
}

// ── transcript ─────────────────────────────────────────────────────────────
function Transcript({ detail }: { detail: BoardroomMeetingDetail }) {
  const bySeat = new Map(detail.seats.map((s) => [s.seat_id, s]));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {detail.messages.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: INK.faint }}>{T.waitingNext}</div>
      )}
      {detail.messages.map((m) => {
        const seat = bySeat.get(m.seat_id);
        const color = SEAT_COLORS[m.seat_id] ?? INK.faint;
        const isError = m.status === 'error';
        return (
          <div key={m.id} style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', border: `2px solid ${color}`, background: INK.panel2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
              {seat?.position_key === 'ceo' ? '👑' : seat?.position_key === 'research' ? '🔭' : seat?.position_key === 'challenger' ? '⚔️' : '💼'}
            </div>
            <div style={{ flex: 1, minWidth: 0, background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 10, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color }}>{m.seat_name}</span>
                <span style={{ background: INK.panel2, borderRadius: 999, padding: '1px 8px', fontSize: 10, color: INK.dim }}>{PHASE_LABEL[m.phase] ?? m.phase}</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, color: INK.faint }}>tok {fmtTokens(m.tokens_in)}→{fmtTokens(m.tokens_out)}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.65, color: isError ? INK.red : INK.ink }}>
                {isError ? m.error ?? '⚠️ เรียกโมเดลไม่สำเร็จ — ข้ามที่นั่งนี้' : <Md text={m.content_md} />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── claims section ─────────────────────────────────────────────────────────
function ClaimsSection({ claims }: { claims: BoardroomClaim[] }) {
  if (!claims.length) return null;
  const groups = ['verified', 'partial', 'failed', 'unverifiable'].map((v) => [v, claims.filter((c) => c.verdict === v)] as const).filter(([, cs]) => cs.length);
  return (
    <div>
      <h3 style={{ fontSize: 13, color: INK.dim, margin: '0 0 8px' }}>{T.verification}</h3>
      {groups.map(([v, cs]) => (
        <div key={v} style={{ marginBottom: 8 }}>
          <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 600, color: VERDICT[v].color }}>
            {v === 'verified' ? '✓' : v === 'failed' ? '✗' : v === 'partial' ? '🔶' : '?'} {VERDICT[v].label} ({cs.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {cs.map((c) => <ClaimBadge key={c.id} claim={c} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── seat claim stats (ประชุมนี้ — cold-start disclosure per ticket 05) ────
function ClaimStats({ claims, seats }: { claims: BoardroomClaim[]; seats: BoardroomSeat[] }) {
  if (!seats.length) return null;
  const bySeat = new Map<string, { total: number; verified: number; partial: number; failed: number }>();
  for (const c of claims) {
    const d = bySeat.get(c.seat_id) ?? { total: 0, verified: 0, partial: 0, failed: 0 };
    d.total += 1;
    if (c.verdict === 'verified') d.verified += 1;
    else if (c.verdict === 'partial') d.partial += 1;
    else if (c.verdict === 'failed') d.failed += 1;
    bySeat.set(c.seat_id, d);
  }
  const rows = seats.filter((s) => s.enabled).map((s) => ({ seat: s, d: bySeat.get(s.seat_id) }));
  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 12, padding: 14 }}>
      <h3 style={{ fontSize: 13, color: INK.dim, margin: '0 0 2px' }}>{T.claimStatsTitle}</h3>
      <p style={{ margin: '0 0 10px', fontSize: 10, color: INK.faint }}>{T.claimStatsHint}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
        {rows.map(({ seat, d }) => {
          if (!d || d.total === 0) {
            return (
              <div key={seat.seat_id} style={{ background: INK.panel2, borderRadius: 8, padding: 10, fontSize: 11 }}>
                <span style={{ color: INK.dim, fontWeight: 600 }}>{seat.name_th}</span>
                <span style={{ color: INK.faint }}> — ไม่มีข้อกล่าวอ้าง</span>
              </div>
            );
          }
          const pct = d.total >= 10 ? Math.round((d.verified / d.total) * 100) : null;
          const showPct = d.total >= 10;
          const color = pct != null && pct < 45 ? INK.red : pct != null && pct < 60 ? INK.amber : INK.emerald;
          return (
            <div key={seat.seat_id} style={{ background: INK.panel2, borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: INK.dim, fontWeight: 600 }}>{seat.name_th}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: showPct ? color : INK.faint }}>
                  {showPct ? `${pct}%` : T.waitingData}
                </span>
              </div>
              <div style={{ marginTop: 4, fontSize: 10, color: INK.faint }}>
                {d.verified}✓ · {d.partial}🔶 · {d.failed}✗ · รวม {d.total}
                {!showPct && <span> ({T.waitingData} n&lt;10)</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── main dashboard ─────────────────────────────────────────────────────────
export function BoardroomDashboard({ focusMeetingId }: { focusMeetingId?: string | null }) {
  const [meetings, setMeetings] = useState<BoardroomMeeting[]>([]);
  const [detail, setDetail] = useState<BoardroomMeetingDetail | null>(null);
  const [showOpen, setShowOpen] = useState(false);
  const [agenda, setAgenda] = useState('');
  const [starting, setStarting] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // ตัวกรองคลังประชุม (9.4) — กรองฝั่ง server เพื่อให้เห็นประชุมเก่ากว่า 50 รายการล่าสุด
  // `archive` แยกจาก `meetings` เพราะ `meetings` ยังต้องเป็นรายการไม่กรอง:
  // แผงประชุมสด (บรรทัด running) และตัวล็อกปุ่มเปิดประชุมอ่านจากมัน
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterTrigger, setFilterTrigger] = useState<string | null>(null);
  const [archive, setArchive] = useState<BoardroomMeeting[] | null>(null);
  const filtering = filterStatus !== null || filterTrigger !== null;

  // จากแท็บ "สัญญาณที่ประชุม": กด "ไปที่ประชุม" → โหลดมตินั้นอัตโนมัติ
  const [focusedId, setFocusedId] = useState<string | null>(focusMeetingId ?? null);
  useEffect(() => {
    if (focusMeetingId && focusMeetingId !== focusedId) {
      setFocusedId(focusMeetingId);
      loadDetail(focusMeetingId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMeetingId]);

  const anyRunning = meetings.some((m) => m.status === 'running');
  const detailRunning = detail?.status === 'running';

  const loadList = useCallback(async () => {
    try {
      const data = await listBoardroomMeetings();
      setMeetings(data.meetings);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await getBoardroomMeeting(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดประชุมไม่สำเร็จ');
    }
  }, []);

  // list polling: 10s while running, 30s otherwise
  useEffect(() => {
    loadList();
    const iv = setInterval(loadList, anyRunning ? 10000 : 30000);
    return () => clearInterval(iv);
  }, [loadList, anyRunning]);

  // คลังประชุมแบบกรอง — ยิงเฉพาะตอนมีตัวกรอง ไม่กรอง = ใช้ผลเดิม ไม่ยิงซ้ำ
  const loadArchive = useCallback(async () => {
    if (!filtering) {
      setArchive(null);
      return;
    }
    try {
      setArchive((await listBoardroomMeetings(filterStatus, filterTrigger)).meetings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    }
  }, [filtering, filterStatus, filterTrigger]);

  useEffect(() => {
    loadArchive();
  }, [loadArchive]);

  const archiveList = archive ?? meetings;

  // detail polling: 3s while the viewed meeting is running
  useEffect(() => {
    if (!detail?.id || !detailRunning) return;
    const iv = setInterval(() => loadDetail(detail.id), 3000);
    return () => clearInterval(iv);
  }, [detail?.id, detailRunning, loadDetail]);

  const submitOpen = async () => {
    if (!agenda.trim() || anyRunning) return;
    setStarting(true);
    setError(null);
    try {
      const m = await createBoardroomMeeting({ agenda: agenda.trim(), trigger_type: 'manual', mode: 'full' });
      setAgenda('');
      setShowOpen(false);
      await loadDetail(m.id);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เปิดประชุมไม่สำเร็จ');
    } finally {
      setStarting(false);
    }
  };

  const submitResume = async (id: string) => {
    setResumingId(id);
    setError(null);
    try {
      await resumeBoardroomMeeting(id);
      await loadDetail(id);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ประชุมต่อไม่สำเร็จ');
    } finally {
      setResumingId(null);
    }
  };

  const running = meetings.find((m) => m.status === 'running') ?? null;

  // phase stepper: unique phases in turn_plan order (fallback: static order)
  const phaseList = useMemo(() => {
    if (detail?.turn_plan) {
      const plan = parseJson<{ phase: string }[]>(detail.turn_plan, []);
      const seen: string[] = [];
      for (const t of plan) {
        if (t?.phase && !seen.includes(t.phase)) seen.push(t.phase);
      }
      if (seen.length) return seen;
    }
    return PHASES.map((p) => p.key);
  }, [detail?.turn_plan]);

  const speakingSeat = useMemo(() => {
    if (!detail || detail.status !== 'running' || !detail.turn_plan) return null;
    const plan = parseJson<{ phase: string; seat: string; kind: string }[]>(detail.turn_plan, []);
    return plan[detail.current_turn]?.seat ?? null;
  }, [detail]);

  const backToList = () => setDetail(null);

  return (
    <div>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>🏛️ {T.title}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: INK.faint }}>{T.subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!anyRunning && (
            <button
              onClick={() => setShowOpen((v) => !v)}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'rgba(56,189,248,0.15)', color: INK.accent, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
            >
              ＋ {T.openMeeting}
            </button>
          )}
        </div>
      </div>

      {/* disclaimer (principle #3) */}
      <div style={{ background: 'rgba(245,158,11,0.06)', border: `1px solid rgba(245,158,11,0.25)`, borderRadius: 8, padding: '6px 12px', fontSize: 11, color: '#fbbf24', marginBottom: 14 }}>
        ⚠️ {T.disclaimer} — มติจาก AI มีไว้ประกอบการวิเคราะห์เท่านั้น
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: `1px solid rgba(248,113,113,0.4)`, color: INK.red, borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* open meeting form */}
      {showOpen && !anyRunning && (
        <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <textarea
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            placeholder={T.agendaPlaceholder}
            rows={3}
            maxLength={2000}
            style={{ width: '100%', boxSizing: 'border-box', background: INK.panel2, border: `1px solid ${INK.border}`, borderRadius: 8, padding: 10, color: INK.ink, fontSize: 13, resize: 'vertical', outline: 'none' }}
          />
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={submitOpen}
              disabled={starting || !agenda.trim()}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(56,189,248,0.15)', color: INK.accent, fontWeight: 600, fontSize: 12, cursor: 'pointer', opacity: starting || !agenda.trim() ? 0.5 : 1 }}
            >
              {starting ? T.starting : T.openMeeting}
            </button>
            {anyRunning && <span style={{ fontSize: 11, color: INK.faint }}>{T.meetingRunning}</span>}
          </div>
        </div>
      )}

      {/* live meeting card */}
      {!detail && running && (
        <div style={{ background: INK.panel, border: `1px solid rgba(56,189,248,0.5)`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: INK.accent, display: 'inline-block' }} />
            <b style={{ fontSize: 13, color: INK.accent }}>{T.live}</b>
            <TriggerBadge trigger={running.trigger_type} />
            <span style={{ marginLeft: 'auto', fontSize: 11, color: INK.faint }}>
              {T.calls}: {running.llm_calls} · tokens {fmtTokens(running.tokens_in)} / {fmtTokens(running.tokens_out)}
            </span>
          </div>
          <p style={{ margin: '8px 0 10px', fontSize: 13, color: INK.ink }}>{running.agenda}</p>
          <button
            onClick={() => loadDetail(running.id)}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid rgba(56,189,248,0.5)`, background: 'transparent', color: INK.accent, fontSize: 12, cursor: 'pointer' }}
          >
            {T.watchLive} →
          </button>
        </div>
      )}

      {/* detail view */}
      {detail ? (
        <div>
          <button onClick={backToList} style={{ background: 'none', border: 'none', color: INK.faint, fontSize: 12, cursor: 'pointer', padding: '0 0 10px' }}>
            {T.back}
          </button>
          {/* meeting header */}
          <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.4 }}>{detail.agenda}</h3>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <StatusBadge status={detail.status} />
                  <TriggerBadge trigger={detail.trigger_type} />
                  <span style={{ fontSize: 10, color: INK.faint }}>{fmtTime(detail.created_at)}</span>
                  <span style={{ fontSize: 10, color: INK.faint }}>
                    {T.calls}: {detail.llm_calls} · tokens {fmtTokens(detail.tokens_in)} / {fmtTokens(detail.tokens_out)}
                    {detail.mode === 'short' && ` · ${T.modeShort}`}
                  </span>
                </div>
                {detail.status === 'failed' && detail.error && (
                  <div style={{ marginTop: 8, color: INK.red, fontSize: 12 }}>⚠️ {detail.error}</div>
                )}
              </div>
              {detail.status === 'failed' && (
                <button
                  onClick={() => submitResume(detail.id)}
                  disabled={resumingId === detail.id}
                  style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid rgba(52,211,153,0.4)`, background: 'rgba(52,211,153,0.1)', color: INK.emerald, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
                >
                  {resumingId === detail.id ? T.resuming : `▶ ${T.resume}`}
                </button>
              )}
            </div>
            {/* phase stepper */}
            <div style={{ marginTop: 12, display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              {phaseList.map((ph, i) => {
                const isCurrent = detail.status === 'running' && detail.phase === ph;
                const done = detail.status === 'completed' || (detail.status === 'running' && phaseList.indexOf(detail.phase) > i);
                return (
                  <span
                    key={ph}
                    style={{
                      whiteSpace: 'nowrap', borderRadius: 999, border: `1px solid ${isCurrent ? 'rgba(56,189,248,0.6)' : done ? 'rgba(56,189,248,0.3)' : INK.border}`,
                      background: isCurrent ? 'rgba(56,189,248,0.15)' : 'transparent',
                      color: isCurrent ? INK.accent : done ? 'rgba(56,189,248,0.8)' : INK.faint,
                      padding: '3px 10px', fontSize: 11,
                    }}
                  >
                    {isCurrent && <span style={{ marginRight: 4 }}>●</span>}
                    {PHASE_LABEL[ph] ?? ph}
                  </span>
                );
              })}
            </div>
            {/* seats */}
            {detail.seats.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: '10px 6px', justifyContent: 'center' }}>
                {detail.seats.filter((s) => s.enabled).map((s) => (
                  <SeatChip key={s.seat_id} seat={s} speaking={speakingSeat === s.seat_id} />
                ))}
              </div>
            )}
            {detailRunning && (
              <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: INK.faint }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: INK.accent, marginRight: 6 }} />
                {T.speaking}
              </div>
            )}
          </div>

          {/* resolution */}
          {detail.status === 'completed' && detail.resolution_json && <Resolution detail={detail} />}

          {/* claims section */}
          {detail.claims.length > 0 && (
            <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 12, padding: 14, marginTop: 12 }}>
              <ClaimsSection claims={detail.claims} />
            </div>
          )}

          {/* per-meeting claim stats (ticket 05 cold-start disclosure) */}
          <div style={{ marginTop: 12 }}>
            <ClaimStats claims={detail.claims} seats={detail.seats} />
          </div>

          {/* transcript */}
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 13, color: INK.dim, margin: '0 0 10px' }}>💬 {T.transcript}</h3>
            <Transcript detail={detail} />
          </div>
        </div>
      ) : (
        <>
          {/* archive list */}
          <h3 style={{ fontSize: 13, color: INK.dim, margin: '16px 0 10px' }}>🗂️ {T.archive}</h3>

          {/* ตัวกรอง (9.4) — กรองที่ server จึงเห็นประชุมเก่ากว่า 50 รายการล่าสุดด้วย */}
          <div data-testid="meeting-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: INK.faint, marginRight: 2 }}>สถานะ</span>
            {(Object.keys(STATUS) as string[]).map((key) => (
              <FilterChip
                key={key}
                label={STATUS[key].label}
                active={filterStatus === key}
                color={STATUS[key].color}
                onClick={() => setFilterStatus(filterStatus === key ? null : key)}
              />
            ))}
            <span style={{ fontSize: 11, color: INK.faint, margin: '0 2px 0 8px' }}>ที่มา</span>
            {(Object.keys(TRIGGER) as string[]).map((key) => (
              <FilterChip
                key={key}
                label={TRIGGER[key]}
                active={filterTrigger === key}
                color={INK.dim}
                onClick={() => setFilterTrigger(filterTrigger === key ? null : key)}
              />
            ))}
            {filtering && (
              <button
                onClick={() => { setFilterStatus(null); setFilterTrigger(null); }}
                style={{ marginLeft: 'auto', cursor: 'pointer', background: 'transparent', border: 'none', color: INK.accent, fontSize: 11, textDecoration: 'underline' }}
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>

          {loaded && archiveList.length === 0 ? (
            <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 12, padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🏛️</div>
              <p style={{ margin: 0, fontSize: 13, color: INK.dim }}>
                {filtering ? 'ไม่พบประชุมที่ตรงกับตัวกรอง' : T.empty}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {archiveList.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => loadDetail(m.id)}
                    style={{ textAlign: 'left', cursor: 'pointer', background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 10, padding: '12px 14px', display: 'block', width: '100%', color: INK.ink }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <StatusBadge status={m.status} />
                      <TriggerBadge trigger={m.trigger_type} />
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: INK.faint }}>{fmtTime(m.created_at)}</span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5 }}>{m.agenda}</p>
                    <div style={{ marginTop: 6, fontSize: 10, color: INK.faint }}>
                      {T.calls}: {m.llm_calls} · tokens {fmtTokens(m.tokens_in)} / {fmtTokens(m.tokens_out)}
                    </div>
                  </button>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
