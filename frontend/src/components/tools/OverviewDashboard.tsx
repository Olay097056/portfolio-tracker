import { useCallback, useEffect, useState } from 'react';
import { RiskBanner } from './RiskBanner';
import { getOverviewDashboard, refreshOverviewBrief } from '../../api/client';
import type {
  OverviewDashboard, OverviewKeyFigure, OverviewModelCard, OverviewYieldPoint,
} from '../../api/types';

// Overview Dashboard — ภาพรวม (/) ของ bond-crisis-dashboard-v2:
// AI สรุปสถานการณ์ + คำแนะนำ + จินตนาการ + เหตุการณ์สำคัญข้างหน้า + REGIME
// ปัจจุบัน + โมเดลอันดับ 1 + คะแนนความเสี่ยงประเทศ + ตัวเลขสำคัญ + Yield Curve
// + 6 โมเดลทำกำไร (การ์ดพร้อมสถานะ/คะแนน).
// ใช้ชุดสี "ink" ของต้นฉบับ — scope ภายใน component นี้เท่านั้น (ไม่แตะธีมรวม)

const INK = {
  panel: '#101623',
  panelBorder: '#1e2940',
  ink: '#e8eef7',
  inkDim: '#8b9bb4',
  inkFaint: '#5a6b85',
  accent: '#38bdf8',
  emerald: '#34d399',
  red: '#f87171',
  amber: '#f59e0b',
  violet: '#a78bfa',
  slate: '#475569',
};

const NUM_STYLE: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

const STATUS_STYLE: Record<string, { bg: string; color: string; th: string }> = {
  active: { bg: 'rgba(52,211,153,0.15)', color: INK.emerald, th: 'ทำงาน' },
  building: { bg: 'rgba(245,158,11,0.15)', color: INK.amber, th: 'กำลังก่อตัว' },
  inactive: { bg: 'rgba(71,85,105,0.4)', color: '#94a3b8', th: 'ไม่ทำงาน' },
  fading: { bg: 'rgba(249,115,113,0.15)', color: INK.red, th: 'อ่อนแรง' },
};

const PHASE_COLOR: Record<string, string> = {
  normal: INK.emerald,
  recovery: '#38bdf8',
  'inflation-pressure': INK.amber,
  'policy-pivot': INK.violet,
  'yield-shock': '#f97316',
  'credit-stress': INK.red,
  'banking-stress': '#fb7185',
};

function fmtFigure(f: OverviewKeyFigure): string {
  if (f.value === null || f.value === undefined) return '—';
  const v = f.value;
  switch (f.unit) {
    case '%': return `${v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`;
    case 'bps': return `${v.toFixed(0)} bps`;
    case 'USD': return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    default: return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

function fmtChange(f: OverviewKeyFigure): string {
  // "%" cards show bps deltas (change_val × 100) like the reference; "bps"
  // cards show bps directly; everything else shows change_pct as-is.
  //
  // change_pct arrives ALREADY in percent — macro_service.py:734 computes
  // (last / prev - 1) * 100 and overview_service copies that field straight
  // through. This used to multiply by 100 a second time, so VIX printed
  // "-340.00%" for a -3.4% day and gold "+253.00%" for +2.53%.
  // MacroDashboard.tsx:63 renders the same field without the extra factor.
  if (f.unit === '%' && f.change_val !== null) {
    const b = Math.round(f.change_val * 100);
    return `${b > 0 ? '+' : ''}${b} bps`;
  }
  if (f.unit === 'bps' && f.change_val !== null) {
    const b = Math.round(f.change_val);
    return `${b > 0 ? '+' : ''}${b} bps`;
  }
  if (f.change_pct === null || f.change_pct === undefined) return '';
  const p = f.change_pct;
  return `${p > 0 ? '+' : ''}${p.toFixed(2)}%`;
}

function fmtAgo(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  return `${Math.round(h / 24)} วันที่แล้ว`;
}

function Panel({ title, right, children, accent }: {
  title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div style={{
      background: INK.panel, border: `1px solid ${accent ? 'rgba(56,189,248,0.25)' : INK.panelBorder}`,
      borderRadius: 12, padding: 16,
      backgroundImage: accent ? 'linear-gradient(rgba(56,189,248,0.04), rgba(56,189,248,0.04))' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent ? INK.accent : INK.inkFaint }}>
          {title}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function YieldCurveChart({ points }: { points: OverviewYieldPoint[] }) {
  const valid = points.filter((p) => p.yield !== null && p.yield !== undefined);
  if (valid.length < 2) {
    return <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK.inkFaint, fontSize: '0.85rem' }}>—</div>;
  }
  const W = 640, H = 180, PAD = 8;
  const ys = valid.map((p) => p.yield as number);
  const min = Math.min(...ys), max = Math.max(...ys);
  const span = Math.max(max - min, 0.0001);
  const x = (i: number) => PAD + (i / (valid.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 180 }} preserveAspectRatio="none">
      <polyline points={valid.map((p, i) => `${x(i)},${y(p.yield as number)}`).join(' ')}
        fill="none" stroke={INK.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {valid.map((p, i) => (
        <g key={p.tenor}>
          <circle cx={x(i)} cy={y(p.yield as number)} r={3.5} fill={INK.panel} stroke={INK.accent} strokeWidth={2} />
          <text x={x(i)} y={H - 2} textAnchor="middle" fill={INK.inkFaint} fontSize={11}>{p.tenor}</text>
        </g>
      ))}
    </svg>
  );
}

export function OverviewDashboard() {
  const [data, setData] = useState<OverviewDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getOverviewDashboard();
      setData(d);
      setError(null);
    } catch {
      setError('โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refreshBrief = async () => {
    setBriefLoading(true);
    setBriefError(false);
    try {
      await refreshOverviewBrief();
      await load();
    } catch {
      setBriefError(true);
    } finally {
      setBriefLoading(false);
    }
  };

  if (loading) {
    return <div style={{ color: INK.inkDim, padding: 24 }}>กำลังโหลดภาพรวม…</div>;
  }
  if (error || !data) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: INK.red, marginBottom: 12 }}>{error || 'ไม่มีข้อมูล'}</div>
        <button onClick={load} style={{
          padding: '8px 16px', borderRadius: 8, border: `1px solid ${INK.panelBorder}`,
          background: INK.panel, color: INK.ink, cursor: 'pointer',
        }}>ลองใหม่</button>
      </div>
    );
  }

  const regime = data.regime;
  const topModel = data.models[0];
  const phaseColor = PHASE_COLOR[regime?.phase ?? 'normal'] ?? INK.accent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 🚫 Risk warning (D10 — ticket 06) */}
      <RiskBanner id="overview" />
      {/* ── AI สรุปสถานการณ์ ── */}
      <Panel accent title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          ✨ AI สรุปสถานการณ์
          {data.brief?.generated_at && (
            <span style={{ fontSize: '0.68rem', fontWeight: 400, color: INK.inkFaint }}>
              {fmtAgo(data.brief.generated_at)}
            </span>
          )}
        </span>
      } right={
        <button onClick={refreshBrief} disabled={briefLoading} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8,
          border: `1px solid ${INK.panelBorder}`, background: 'transparent',
          color: INK.inkDim, fontSize: '0.72rem', cursor: 'pointer',
        }}>
          {briefLoading ? 'กำลังวิเคราะห์…' : 'สร้างสรุปใหม่'}
        </button>
      }>
        {briefError && <div style={{ color: INK.red, fontSize: '0.78rem', marginBottom: 8 }}>สร้างสรุปใหม่ไม่สำเร็จ — ลองอีกครั้ง</div>}
        {data.brief ? (
          <>
            <p style={{ color: INK.ink, fontSize: '0.9rem', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-line' }}>
              {data.brief.brief_md}
            </p>
            {data.brief.recommendations?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: INK.inkDim, marginBottom: 6 }}>คำแนะนำ</div>
                <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {data.brief.recommendations.map((r, i) => (
                    <li key={i} style={{ color: INK.inkDim, fontSize: '0.82rem', lineHeight: 1.5 }}>{r}</li>
                  ))}
                </ol>
              </div>
            )}
            {data.brief.scenarios?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: INK.inkDim, marginBottom: 6 }}>จินตนาการ</div>
                <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {data.brief.scenarios.map((s, i) => (
                    <li key={i} style={{ color: INK.inkDim, fontSize: '0.82rem', lineHeight: 1.5 }}>{s}</li>
                  ))}
                </ol>
              </div>
            )}
            {data.brief.key_events?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: INK.inkDim, marginBottom: 6 }}>
                  เหตุการณ์สำคัญข้างหน้า <span style={{ fontWeight: 400, color: INK.inkFaint }}>· ข้อมูลปฏิทินจาก ForexFactory</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.brief.key_events.map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700, flexShrink: 0,
                        background: e.impact === 'High' ? 'rgba(248,113,113,0.15)' : 'rgba(245,158,11,0.15)',
                        color: e.impact === 'High' ? INK.red : INK.amber,
                      }}>{e.impact}</span>
                      <span style={{ color: INK.inkFaint, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{e.date_th || e.date}</span>
                      <span style={{ color: INK.ink, fontWeight: 600 }}>{e.title}</span>
                      <span style={{ color: INK.inkFaint, marginLeft: 'auto' }}>
                        {e.forecast ? `คาด ${e.forecast}` : ''}{e.previous ? ` · ก่อนหน้า ${e.previous}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: INK.inkFaint, fontSize: '0.85rem', margin: 0 }}>
            ยังไม่มีบทสรุป — กด "สร้างสรุปใหม่" เพื่อให้ AI วิเคราะห์สถานการณ์ล่าสุด
          </p>
        )}
      </Panel>

      {/* ── REGIME / โมเดลอันดับ 1 / คะแนนประเทศ ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Panel title="Regime ปัจจุบัน">
          {regime ? (
            <>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: phaseColor }}>
                {regime.phase_th || regime.phase || '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, fontSize: '0.78rem', color: INK.inkDim }}>
                <span>ความครบของข้อมูล: <span style={{ fontWeight: 700, color: INK.ink }}>{regime.confidence ?? 0}%</span></span>
                {regime.is_transition_zone && (
                  <span style={{ background: 'rgba(167,139,250,0.15)', color: INK.violet, padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem' }}>
                    โซนเปลี่ยนผ่าน
                  </span>
                )}
              </div>
              {regime.triggers && regime.triggers.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {regime.triggers.slice(0, 3).map((t) => (
                    <div key={t.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <span style={{ color: INK.inkDim }}>{t.name}</span>
                      <span style={{ color: INK.inkFaint, fontWeight: 700 }}>{t.strength}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : <div style={{ color: INK.inkFaint }}>—</div>}
        </Panel>

        <Panel title="โมเดลอันดับ 1" right={<a href="#models" style={{ color: INK.accent, fontSize: '0.72rem', textDecoration: 'none' }}>โมเดลทำกำไร →</a>}>
          {topModel ? (
            <>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: INK.ink }}>{topModel.name_th}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: '1.9rem', fontWeight: 800, color: INK.accent, ...NUM_STYLE }}>
                  {topModel.score?.toFixed(1) ?? '—'}
                </span>
                <span style={{ fontSize: '0.75rem', color: INK.inkFaint }}>/100</span>
                {topModel.status && (
                  <span style={{
                    background: STATUS_STYLE[topModel.status]?.bg ?? 'rgba(71,85,105,0.4)',
                    color: STATUS_STYLE[topModel.status]?.color ?? '#94a3b8',
                    padding: '3px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700,
                  }}>
                    {STATUS_STYLE[topModel.status]?.th ?? topModel.status}
                  </span>
                )}
              </div>
              {regime?.top_model_trade_direction && (
                <p style={{ color: INK.inkDim, fontSize: '0.78rem', margin: '8px 0 0', lineHeight: 1.5 }}>
                  {regime.top_model_trade_direction}
                </p>
              )}
            </>
          ) : <div style={{ color: INK.inkFaint }}>—</div>}
        </Panel>

        <Panel title="คะแนนความเสี่ยงประเทศ" right={<a href="#countries" style={{ color: INK.accent, fontSize: '0.72rem', textDecoration: 'none' }}>ดูทั้งหมด</a>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.country_risk.top.map((c) => (
              <div key={c.country_code} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 700, color: INK.ink, width: 28 }}>{c.country_code}</span>
                <div style={{ flex: 1, height: 6, background: INK.panelBorder, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, c.score ?? 0)}%`, height: '100%',
                    background: (c.score ?? 0) >= 50 ? INK.red : (c.score ?? 0) >= 30 ? INK.amber : INK.emerald,
                  }} />
                </div>
                <span style={{ color: INK.inkFaint, fontWeight: 700, width: 32, textAlign: 'right', ...NUM_STYLE }}>{c.score ?? '—'}</span>
              </div>
            ))}
            <div style={{ color: INK.inkFaint, fontSize: '0.72rem', marginTop: 4 }}>
              ดูเพิ่มเติม ({Math.max(0, data.country_risk.total - data.country_risk.top.length)})
            </div>
          </div>
        </Panel>
      </div>

      {/* ── ตัวเลขสำคัญ ── */}
      <Panel title="ตัวเลขสำคัญ">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {data.key_figures.map((f) => (
            <div key={f.series_id} style={{
              background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 10, padding: '10px 12px',
            }}>
              <div style={{ fontSize: '0.7rem', color: INK.inkFaint }}>{f.name_th}</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: INK.ink, marginTop: 2, ...NUM_STYLE }}>
                {fmtFigure(f)}
              </div>
              {fmtChange(f) && (
                <div style={{ fontSize: '0.7rem', color: fmtChange(f).startsWith('-') ? INK.red : INK.emerald }}>
                  {fmtChange(f)}
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Yield Curve + 6 โมเดล ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <Panel title="Yield Curve — US">
          <YieldCurveChart points={data.yield_curve} />
        </Panel>

        <Panel title="โมเดลทำกำไร">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.models.map((m: OverviewModelCard) => (
              <div key={m.model_id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 10,
              }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, background: m.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: INK.ink }}>{m.name_th}</div>
                </div>
                <span style={{
                  fontSize: '0.66rem', padding: '2px 6px', borderRadius: 5, fontWeight: 700,
                  background: STATUS_STYLE[m.status ?? '']?.bg ?? 'rgba(71,85,105,0.4)',
                  color: STATUS_STYLE[m.status ?? '']?.color ?? '#94a3b8',
                }}>
                  {STATUS_STYLE[m.status ?? '']?.th ?? '—'}
                </span>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: INK.ink, width: 48, textAlign: 'right', ...NUM_STYLE }}>
                  {m.score?.toFixed(1) ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ fontSize: '0.68rem', color: INK.inkFaint }}>
        อัปเดตล่าสุด: {data.updated_at} · แหล่งข้อมูล: {data.data_sources.join(' · ')}
      </div>
    </div>
  );
}
