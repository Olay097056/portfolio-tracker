import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  generateCountryReport,
  getCountryBrief,
  getCountryDetail,
} from '../../api/client';
import type { CountryBrief, CountryDetail, CountryReport } from '../../api/types';

// Country detail page (รายประเทศ → /countries/:code) — mirrors the reference
// page: header (flag/name/data-tier/score/sparkline), AI สรุปสถานการณ์ brief,
// full-tenor yield curve, risk scorecard bars, mini stat cards, duration
// stress-test simulator and the AI deep report. Missing data renders "—".

const INK = {
  bg: '#0d1220',
  panel: '#131a2b',
  panelBorder: '#1e2940',
  panel2: '#1a2338',
  text: '#e6ecf5',
  textDim: '#c0c8d8',
  inkDim: '#8a97ad',
  inkFaint: '#5a6b85',
  green: '#34d399',
  emerald: '#10b981',
  amber: '#f59e0b',
  orange: '#fb923c',
  red: '#f87171',
  sky: '#38bdf8',
  accent: '#38bdf8',
};

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return INK.inkFaint;
  if (score >= 75) return INK.red;
  if (score >= 55) return INK.orange;
  if (score >= 30) return INK.amber;
  return INK.emerald;
}

// ── Sparkline (header) ────────────────────────────────────────────────────
function Sparkline({ points, up }: { points: { date: string; value: number }[]; up: boolean }) {
  const W = 160;
  const H = 32;
  if (points.length < 2) return <span style={{ color: INK.inkFaint, fontSize: 10 }}>—</span>;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 2 - ((v - min) / span) * (H - 4);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const stroke = up ? '#f87171' : '#34d399';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} />
    </svg>
  );
}

// ── Yield curve chart (hand-rolled SVG) ───────────────────────────────────
function YieldCurveChart({ points, height }: { points: { tenor: string; value: number }[]; height: number }) {
  const W = 600;
  const H = height;
  if (points.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK.inkFaint, fontSize: 13 }}>
        ข้อมูลจำกัด อาจล่าช้าบางวัน
      </div>
    );
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values) - 0.1;
  const max = Math.max(...values) + 0.1;
  const span = max - min || 1;
  const padL = 40;
  const padB = 24;
  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - 8);
  const y = (v: number) => H - padB - ((v - min) / span) * (H - padB - 14);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const gridY = [0.25, 0.5, 0.75];
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {gridY.map((g) => (
        <line key={g} x1={padL} x2={W - 8} y1={H - padB - g * (H - padB - 14)} y2={H - padB - g * (H - padB - 14)} stroke={INK.panelBorder} strokeWidth={1} />
      ))}
      {points.map((p, i) => (
        <g key={p.tenor}>
          <circle cx={x(i)} cy={y(p.value)} r={3} fill={INK.accent} />
          {i % 2 === 0 && (
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={INK.inkFaint}>{p.tenor}</text>
          )}
        </g>
      ))}
      <path d={line} fill="none" stroke={INK.accent} strokeWidth={2} />
      <text x={8} y={14} fontSize={10} fill={INK.inkFaint}>%</text>
    </svg>
  );
}

// ── Risk scorecard bar ────────────────────────────────────────────────────
function ComponentBar({ label, value }: { label: string; value: number }) {
  const color = value >= 15 ? INK.red : value >= 8 ? INK.amber : INK.emerald;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: INK.inkDim }}>{label}</span>
        <span className="num" style={{ color: INK.inkFaint }}>{fmt(value, 1)}</span>
      </div>
      <div style={{ marginTop: 4, height: 4, borderRadius: 999, background: INK.panel2, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 999, background: color, width: `${Math.min(100, (value / 30) * 100)}%` }} />
      </div>
    </div>
  );
}

// ── Mini stat card ────────────────────────────────────────────────────────
function MiniCard({ card }: { card: { series_id: string; name_th: string; unit: string; value: number | null; change_pct: number | null } }) {
  const chgColor = card.change_pct === null || card.change_pct === undefined ? INK.inkFaint : card.change_pct >= 0 ? INK.red : INK.green;
  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, color: INK.inkFaint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {card.name_th}
      </div>
      <div className="num" style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>
        {card.value === null ? '—' : `${fmt(card.value)}${card.unit ? ' ' + card.unit : ''}`}
      </div>
      <div style={{ fontSize: 12, color: chgColor }}>
        {card.change_pct === null ? '—' : `${card.change_pct > 0 ? '+' : ''}${fmt(card.change_pct, 2)}% 3M`}
      </div>
    </div>
  );
}

// ── Markdown-lite renderer (headings + lists + paragraphs) ────────────────
function Markdown({ md }: { md: string }) {
  const lines = md.split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  let key = 0;
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`ul-${key++}`} style={{ margin: '8px 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {list.map((li, i) => <li key={i} style={{ fontSize: 13, color: INK.textDim }}>{li}</li>)}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      out.push(
        <div key={`h-${key++}`} style={{ fontWeight: 700, fontSize: h[1].length === 1 ? 15 : 13, margin: '10px 0 4px', color: INK.text }}>
          {h[2]}
        </div>,
      );
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) { list.push(li[1]); continue; }
    const num = line.match(/^\d+[.)]\s+(.*)$/);
    if (num) { list.push(num[1]); continue; }
    flush();
    out.push(<p key={`p-${key++}`} style={{ margin: '6px 0', fontSize: 13, lineHeight: 1.6, color: INK.textDim, whiteSpace: 'pre-wrap' }}>{line}</p>);
  }
  flush();
  return <div>{out}</div>;
}

// ── Page ──────────────────────────────────────────────────────────────────
interface Props {
  code: string;
  onBack: () => void;
}

export function CountryDetailPage({ code, onBack }: Props) {
  const [detail, setDetail] = useState<CountryDetail | null>(null);
  const [brief, setBrief] = useState<CountryBrief | null>(null);
  const [report, setReport] = useState<CountryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefLoading, setBriefLoading] = useState(true);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState('');
  const [duration, setDuration] = useState(8);
  const [dYield, setDYield] = useState(200);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await getCountryDetail(code));
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [code]);

  const loadBrief = useCallback(async () => {
    setBriefLoading(true);
    try {
      setBrief(await getCountryBrief(code));
    } catch {
      setBrief(null);
    } finally {
      setBriefLoading(false);
    }
  }, [code]);

  useEffect(() => {
    load();
    loadBrief();
  }, [load, loadBrief]);

  const onGenerateReport = useCallback(async () => {
    setReportBusy(true);
    setReportError('');
    try {
      setReport(await generateCountryReport(code));
    } catch {
      setReportError('สร้างรายงานไม่สำเร็จ — ลองใหม่');
    } finally {
      setReportBusy(false);
    }
  }, [code]);

  const deltaPrice = useMemo(() => -duration * dYield / 100, [duration, dYield]);
  const trendUp = useMemo(() => {
    const t = detail?.trend ?? [];
    if (t.length < 2) return false;
    return t[t.length - 1].value > t[0].value;
  }, [detail]);

  if (loading && !detail) {
    return <div style={{ color: INK.inkFaint, padding: '40px 0' }}>กำลังโหลดข้อมูลประเทศ…</div>;
  }
  if (!detail) {
    return (
      <div style={{ padding: '24px 0' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: INK.accent, cursor: 'pointer', fontSize: 13, marginBottom: 12 }}>← กลับรายประเทศ</button>
        <div style={{ color: INK.red }}>ไม่พบข้อมูลประเทศนี้</div>
        <button onClick={load} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: `1px solid ${INK.panelBorder}`, background: INK.panel, color: INK.text, cursor: 'pointer' }}>ลองใหม่</button>
      </div>
    );
  }

  const c = detail.country;
  const comps = detail.risk?.components;
  const matrixRows = [3, 5, 8, 12];
  const matrixCols = [100, 200, 300];
  const compLabel: Record<string, string> = {
    yield_level: 'ระดับ Yield',
    yield_momentum: 'โมเมนตัม Yield (3 เดือน)',
    fx_depreciation: 'ค่าเงินอ่อนค่า (3 เดือน)',
    data_freshness: 'ความครบ/สดของข้อมูล',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Back */}
      <button onClick={onBack} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: INK.accent, cursor: 'pointer', fontSize: 13 }}>
        ← กลับรายประเทศ
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
            {c.flag} {c.name_th}
          </h3>
          <span style={{ fontSize: 12, color: INK.inkFaint }}>{c.data_tier_note_th}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: INK.inkFaint }}>
            คะแนนความเสี่ยงประเทศ
          </div>
          <div className="num" style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, color: scoreColor(detail.risk?.score) }}>
            {detail.risk?.score === null || detail.risk?.score === undefined ? '—' : fmt(detail.risk.score, 0)}
          </div>
          {detail.trend.length >= 2 && (
            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <Sparkline points={detail.trend} up={trendUp} />
              <span style={{ fontSize: 10, color: INK.inkFaint }}>คะแนนย้อนหลัง 60 วัน</span>
            </div>
          )}
        </div>
      </div>

      {/* AI brief */}
      {brief && (
        <div style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: INK.accent }}>
            💡 AI สรุปสถานการณ์
            <span style={{ fontSize: 10, fontWeight: 400, color: INK.inkFaint }}>{brief.generated_at}</span>
          </div>
          <p style={{ marginTop: 12, whiteSpace: 'pre-line', fontSize: 13, lineHeight: 1.7, color: INK.textDim }}>{brief.brief_md}</p>
          {brief.recommendations.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: INK.inkFaint }}>คำแนะนำ</div>
              <ul style={{ marginTop: 6, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {brief.recommendations.map((r, i) => (
                  <li key={i} style={{ fontSize: 13, color: INK.textDim }}><span className="num" style={{ color: INK.accent }}>{i + 1}.</span> {r}</li>
                ))}
              </ul>
            </div>
          )}
          {brief.scenarios.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: INK.inkFaint }}>จินตนาการ</div>
              <ul style={{ marginTop: 6, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {brief.scenarios.map((s, i) => (
                  <li key={i} style={{ fontSize: 13, color: INK.textDim }}><span className="num" style={{ color: INK.amber }}>{i + 1}.</span> {s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {briefLoading && <div style={{ color: INK.inkFaint, fontSize: 12, padding: '8px 0' }}>กำลังสร้าง AI สรุปสถานการณ์…</div>}

      {/* Yield curve + risk scorecard */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: INK.inkDim }}>Yield Curve</h4>
            {detail.bps_vs_us !== null && detail.bps_vs_us !== undefined && (
              <span style={{ fontSize: 12, color: INK.inkDim }}>
                ส่วนต่างเทียบ US 10Y:{' '}
                <span className="num" style={{ fontWeight: 600, color: detail.bps_vs_us > 0 ? INK.amber : INK.sky }}>
                  {detail.bps_vs_us > 0 ? '+' : ''}{fmt(detail.bps_vs_us, 0)} bps
                </span>
              </span>
            )}
          </div>
          {detail.yield_curve.length >= 2
            ? <YieldCurveChart points={detail.yield_curve} height={250} />
            : <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK.inkFaint, fontSize: 13 }}>
                {c.data_tier_note_th}
              </div>}
          {detail.yield_stale && <div style={{ fontSize: 11, color: INK.orange, marginTop: 8 }}>ข้อมูลเก่า — FRED ล่าสุด 2018</div>}
        </div>

        <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 14, padding: 20 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: INK.inkDim }}>Country Risk Scorecard</h4>
          {comps ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(comps).map(([k, v]) => (
                <ComponentBar key={k} label={compLabel[k] ?? k} value={v ?? 0} />
              ))}
              <p style={{ marginTop: 4, fontSize: 10, color: INK.inkFaint }}>อัพเดตล่าสุด: {detail.risk?.updated_at}</p>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: INK.inkFaint }}>—</div>
          )}
        </div>
      </div>

      {/* Mini stat cards */}
      {detail.mini_cards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {detail.mini_cards.map((mc) => <MiniCard key={mc.series_id} card={mc} />)}
        </div>
      )}

      {/* Duration stress test */}
      <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 14, padding: 20 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: INK.inkDim }}>Duration Stress Test</h4>
        <p style={{ marginTop: 2, fontSize: 11, color: INK.inkFaint }}>
          ΔPrice ≈ -Duration × ΔYield (สูตรประมาณการ ไม่รวม convexity)
        </p>
        <div style={{ marginTop: 16, display: 'grid', gap: 20, gridTemplateColumns: '1fr 1fr auto', alignItems: 'end' }}>
          <label style={{ fontSize: 12, color: INK.inkDim }}>
            Duration: <span className="num" style={{ fontWeight: 700, color: INK.text }}>{duration} ปี</span>
            <input type="range" min={1} max={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))}
              style={{ marginTop: 8, width: '100%', accentColor: INK.sky }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: INK.inkFaint }}>
              <span>1</span><span>3</span><span>5</span><span>8</span><span>12</span><span>15</span>
            </div>
          </label>
          <label style={{ fontSize: 12, color: INK.inkDim }}>
            ΔYield: <span className="num" style={{ fontWeight: 700, color: INK.text }}>+{dYield} bps</span>
            <input type="range" min={25} max={500} step={25} value={dYield} onChange={(e) => setDYield(Number(e.target.value))}
              style={{ marginTop: 8, width: '100%', accentColor: INK.sky }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: INK.inkFaint }}>
              <span>+25</span><span>+100</span><span>+200</span><span>+300</span><span>+500</span>
            </div>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,35,56,0.6)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: INK.inkFaint }}>ΔPrice (ประมาณการ)</div>
            <div className="num" style={{ fontSize: 26, fontWeight: 800, color: INK.red }}>{fmt(deltaPrice, 1)}%</div>
          </div>
        </div>
        <div style={{ marginTop: 16, overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 480, fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${INK.panelBorder}`, textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: INK.inkFaint }}>
                <th style={{ padding: '8px 16px 8px 0' }}>Duration \ ΔYield</th>
                {matrixCols.map((c2) => <th key={c2} className="num" style={{ padding: '8px 16px 8px 0' }}>+{c2} bps</th>)}
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((yr) => (
                <tr key={yr} style={{ borderBottom: `1px solid ${INK.panelBorder}` }}>
                  <td className="num" style={{ padding: '8px 16px 8px 0', fontWeight: 600 }}>{yr} ปี</td>
                  {matrixCols.map((bp) => {
                    const v = -yr * bp / 100;
                    const col = v <= -15 ? INK.red : v <= -8 ? INK.orange : INK.amber;
                    return (
                      <td key={bp} className="num" style={{ padding: '8px 16px 8px 0', color: col, fontWeight: v <= -15 ? 700 : 400 }}>
                        {fmt(v, 1)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI report */}
      <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: INK.inkDim }}>📄 รายงานล่าสุด</h4>
          <button
            onClick={onGenerateReport}
            disabled={reportBusy}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: INK.accent, color: INK.bg, fontWeight: 600, fontSize: 12, cursor: reportBusy ? 'wait' : 'pointer' }}
          >
            {reportBusy ? 'กำลังสร้างรายงาน (ใช้เวลา 1-3 นาที)...' : 'สร้างรายงาน AI เชิงลึก'}
          </button>
        </div>
        {reportError && <p style={{ marginTop: 8, fontSize: 12, color: INK.red }}>{reportError}</p>}
        {report ? (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 11, color: INK.inkFaint }}>{report.generated_at} · {report.model_used}</p>
            <Markdown md={report.report_md} />
          </div>
        ) : (
          !reportBusy && <p style={{ marginTop: 16, fontSize: 13, color: INK.inkFaint }}>ยังไม่มีรายงาน — กดปุ่มด้านบนเพื่อให้ AI วิเคราะห์เชิงลึก 14 หัวข้อ</p>
        )}
      </div>
    </div>
  );
}
