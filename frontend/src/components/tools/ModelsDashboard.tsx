import { useCallback, useEffect, useMemo, useState } from 'react';
import { getModelsDashboard, refreshModelsDashboard } from '../../api/client';
import type {
  ModelsDashboard as ModelsDashboardData,
  ModelResult,
  ModelMeta,
  ModelFactors,
  ModelHistoryPoint,
} from '../../api/types';

// Models — จำลองหน้า /models ของ bond-crisis-dashboard-v2 ให้เหมือนต้นฉบับ:
// header + ปุ่มรีเฟรช, กราฟประวัติคะแนน 30 วัน (พร้อมเส้นเกณฑ์ 40/60),
// และการ์ดโมเดล 6 ตัว เรียงตามคะแนน — คลิกเพื่อขยายดูทิศทางเทรด, Regime,
// เงื่อนไข Activation และตารางสินทรัพย์ที่เทรด
//
// ใช้ชุดสี "ink" ของต้นฉบับ (#101623 panel, #1e2940 border, #38bdf8 accent)
// และสีประจำโมเดลจากต้นฉบับ (recovery #38bdf8, oil #f59e0b, pivot #a78bfa,
// yield-shock #f97316, credit-panic #f87171, bank-run #34d399)

const INK = {
  panel: '#101623',
  panel2: '#182136',
  panelBorder: '#1e2940',
  ink: '#e8eef7',
  inkDim: '#8b9bb4',
  inkFaint: '#5a6b85',
  accent: '#38bdf8',
  emerald: '#34d399',
  red: '#f87171',
  amber: '#f59e0b',
  slate: '#475569',
};

const NUM_STYLE: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

const STATUS_CLS: Record<string, { bg: string; fg: string }> = {
  inactive: { bg: 'rgba(71,85,105,0.5)', fg: '#94a3b8' },
  building: { bg: 'rgba(245,158,11,0.15)', fg: '#fbbf24' },
  active: { bg: 'rgba(52,211,153,0.15)', fg: '#34d399' },
  fading: { bg: 'rgba(249,115,22,0.15)', fg: '#fb923c' },
};

const FACTOR_ORDER = ['market_structure', 'macro', 'news', 'confirmation', 'risk_penalty'];

function statusBadge(status: string, statusMeta: Record<string, { en: string; th: string }>) {
  const cls = STATUS_CLS[status] ?? STATUS_CLS.inactive;
  const label = statusMeta[status]?.th ?? status;
  return (
    <span
      style={{
        borderRadius: 4,
        padding: '2px 6px',
        fontSize: 11,
        fontWeight: 600,
        background: cls.bg,
        color: cls.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function DirPill({ direction }: { direction: string }) {
  const long = direction === 'long';
  return (
    <span
      style={{
        borderRadius: 4,
        padding: '1px 6px',
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        background: long ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
        color: long ? INK.emerald : INK.red,
      }}
    >
      {long ? 'Long' : 'Short'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Score history chart — hand-rolled SVG multi-line (no new dependency; the
// project's lightweight-charts is time-series-only and the reference site's
// own chart is a recharts LineChart which we don't want to add).
// ---------------------------------------------------------------------------
const CHART_W = 880;
const CHART_H = 280;
const PAD_X = 48;
const PAD_TOP = 20;
const PAD_BOTTOM = 30;

function ScoreHistoryChart({
  history,
  meta,
  thresholds,
  newsFactorSince,
}: {
  history: ModelHistoryPoint[];
  meta: ModelMeta[];
  thresholds: { building: number; active: number };
  newsFactorSince?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(() => {
    // x = index over history snapshots; y = score 0-100.
    const x = (i: number) => PAD_X + (i / Math.max(1, history.length - 1)) * (CHART_W - PAD_X * 2);
    const y = (v: number) => PAD_TOP + (1 - v / 100) * (CHART_H - PAD_TOP - PAD_BOTTOM);
    return { x, y };
  }, [history.length]);

  // News-factor divider: history snapshots before this date were scored
  // WITHOUT the news factor (hardcoded 0), after WITH it — the two halves
  // are not on the same scale (decision from forecast map ticket 05).
  const newsDivider = useMemo(() => {
    if (!newsFactorSince) return null;
    const idx = history.findIndex((h) => h.recorded_at.slice(0, 5) >= newsFactorSince.slice(0, 5));
    return idx > 0 ? idx : null;
  }, [history, newsFactorSince]);

  const yGrid = [0, 20, 40, 60, 80, 100];
  const labelEvery = Math.max(1, Math.ceil(history.length / 8));

  if (history.length < 2) {
    return (
      <div style={{ height: CHART_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 12, color: INK.inkFaint }}>
          ยังไม่มีข้อมูลสะสม — กราฟจะเพิ่มจุดใหม่ทุกครั้งที่รีเฟรช (ตรงต้นฉบับ: ทุก 1 ชั่วโมง)
        </span>
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      onMouseLeave={() => setHover(null)}
    >
      {/* horizontal gridlines */}
      {yGrid.map((v) => (
        <g key={v}>
          <line x1={PAD_X} x2={CHART_W - PAD_X} y1={points.y(v)} y2={points.y(v)} stroke={INK.panelBorder} strokeWidth={1} />
          <text x={PAD_X - 8} y={points.y(v) + 3} textAnchor="end" fontSize={10} fill={INK.inkFaint}>
            {v}
          </text>
        </g>
      ))}

      {/* threshold reference lines: 40 (building) and 60 (active) */}
      {[
        { value: thresholds.building, color: INK.amber, label: `เกณฑ์ก่อตัว (${thresholds.building})` },
        { value: thresholds.active, color: INK.emerald, label: `เกณฑ์ทำงาน (${thresholds.active})` },
      ].map((t) => (
        <g key={t.value}>
          <line
            x1={PAD_X}
            x2={CHART_W - PAD_X}
            y1={points.y(t.value)}
            y2={points.y(t.value)}
            stroke={t.color}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <text x={CHART_W - PAD_X - 4} y={points.y(t.value) - 4} textAnchor="end" fontSize={10} fill={t.color}>
            {t.label}
          </text>
        </g>
      ))}

      {/* news-factor divider — scores before/after are not on the same scale */}
      {newsDivider !== null && (
        <g>
          <line
            x1={points.x(newsDivider)}
            x2={points.x(newsDivider)}
            y1={PAD_TOP}
            y2={CHART_H - PAD_BOTTOM}
            stroke={INK.amber}
            strokeWidth={1.5}
            strokeDasharray="6 3"
          />
          <text x={points.x(newsDivider) + 6} y={PAD_TOP + 10} fontSize={10} fill={INK.amber}>
            คะแนนก่อน/หลังรวม news factor ({newsFactorSince})
          </text>
        </g>
      )}

      {/* x-axis labels (thinned) */}
      {history.map((h, i) =>
        i % labelEvery === 0 ? (
          <text key={h.recorded_at} x={points.x(i)} y={CHART_H - 8} textAnchor="middle" fontSize={10} fill={INK.inkFaint}>
            {h.recorded_at}
          </text>
        ) : null,
      )}

      {/* one polyline per model */}
      {meta.map((m) => {
        const series = history.map((h) => h.scores[m.model_id]).filter((v): v is number => v !== undefined);
        if (series.length < 2) return null;
        const d = history
          .map((h, i) => {
            const v = h.scores[m.model_id];
            return v === undefined ? null : `${i === 0 ? 'M' : 'L'}${points.x(i).toFixed(1)},${points.y(v).toFixed(1)}`;
          })
          .filter(Boolean)
          .join(' ');
        return <path key={m.model_id} d={d} fill="none" stroke={m.color} strokeWidth={1.8} strokeLinejoin="round" />;
      })}

      {/* hover: vertical line + per-model values */}
      {hover !== null && history[hover] && (
        <g>
          <line x1={points.x(hover)} x2={points.x(hover)} y1={PAD_TOP} y2={CHART_H - PAD_BOTTOM} stroke={INK.inkFaint} strokeWidth={1} strokeDasharray="2 2" />
          {meta.map((m) => {
            const v = history[hover].scores[m.model_id];
            if (v === undefined) return null;
            return (
              <circle key={m.model_id} cx={points.x(hover)} cy={points.y(v)} r={3} fill={m.color} />
            );
          })}
        </g>
      )}

      {/* invisible hover strip */}
      {history.map((h, i) => (
        <rect
          key={h.recorded_at}
          x={i === 0 ? PAD_X : points.x(i) - (points.x(i) - points.x(i - 1)) / 2}
          y={PAD_TOP}
          width={(points.x(Math.min(history.length - 1, i + 1)) - points.x(Math.max(0, i - 1))) / 2}
          height={CHART_H - PAD_TOP - PAD_BOTTOM}
          fill="transparent"
          onMouseEnter={() => setHover(i)}
        />
      ))}

      {/* hover tooltip */}
      {hover !== null && history[hover] && (
        <g transform={`translate(${Math.min(points.x(hover) + 10, CHART_W - 170)}, ${PAD_TOP + 4})`}>
          <rect width={160} height={16 + meta.length * 16} rx={6} fill={INK.panel} stroke={INK.panelBorder} strokeWidth={1} />
          <text x={8} y={14} fontSize={10} fill={INK.inkDim}>
            {history[hover].recorded_at}
          </text>
          {meta.map((m, mi) => {
            const v = history[hover].scores[m.model_id];
            return (
              <text key={m.model_id} x={8} y={30 + mi * 16} fontSize={10} fill={v === undefined ? INK.inkFaint : m.color}>
                {m.short_th}: {v === undefined ? '—' : v.toFixed(1)}
              </text>
            );
          })}
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Model card
// ---------------------------------------------------------------------------
function ModelCard({
  model,
  meta,
  expanded,
  onToggle,
  factorLabels,
  statusMeta,
}: {
  model: ModelResult;
  meta: ModelMeta;
  expanded: boolean;
  onToggle: () => void;
  factorLabels: Record<string, string>;
  statusMeta: Record<string, { en: string; th: string }>;
}) {
  const color = meta.color;
  const factors = model.factors;
  const conditions = model.conditions.length ? model.conditions : meta && [];

  return (
    <div style={{ background: INK.panel, border: `1px solid ${color}55`, borderRadius: 12, overflow: 'hidden' }}>
      {/* Header row — click to expand */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 16,
          width: '100%',
          padding: '20px',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: INK.ink,
        }}
      >
        <span
          style={{
            ...NUM_STYLE,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 8,
            background: INK.panel2,
            fontSize: 18,
            fontWeight: 700,
            color,
            flexShrink: 0,
          }}
        >
          #{model.rank}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700 }}>{meta.name_th}</span>
            {statusBadge(model.status, statusMeta)}
          </span>
          <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: INK.inkDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {meta.concept_th}
          </span>
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <span style={{ textAlign: 'right' }}>
            <span style={{ ...NUM_STYLE, display: 'block', fontSize: 22, fontWeight: 700, color }}>
              {model.score.toFixed(1)}
            </span>
            <span style={{ fontSize: 10, color: INK.inkFaint }}>
              ความมั่นใจ {model.confidence}%
            </span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={INK.inkFaint} strokeWidth="2" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {/* Factor bars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px 24px', borderTop: `1px solid ${INK.panelBorder}`, padding: '12px 20px' }}>
        {FACTOR_ORDER.map((key) => {
          const value = factors[key as keyof ModelFactors];
          const cap = 25; // factor_caps[key] — kept simple; see data for exact
          const isPenalty = key === 'risk_penalty';
          const abs = Math.abs(value);
          return (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: INK.inkFaint }}>
                <span>{factorLabels[key] ?? key}</span>
                <span style={NUM_STYLE}>
                  {isPenalty && value !== 0 ? '-' : ''}
                  {abs.toFixed(1)}/{cap}
                </span>
              </div>
              <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: INK.panel2, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    borderRadius: 2,
                    background: isPenalty ? INK.red : INK.accent,
                    width: `${Math.min(100, (abs / cap) * 100)}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, borderTop: `1px solid ${INK.panelBorder}`, padding: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: INK.inkFaint }}>ทิศทางเทรด</div>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>{meta.trade_direction}</p>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: INK.inkFaint }}>เหมาะกับ Regime</div>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: INK.inkDim }}>{meta.regime_th}</p>
            </div>
            <div>
              <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: INK.inkFaint }}>เงื่อนไข Activation</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(conditions.length ? conditions : model.conditions).map((c) => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span title={c.logic} style={{ flex: 1, color: INK.inkDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.name}
                    </span>
                    <div style={{ height: 4, width: 80, borderRadius: 2, background: INK.panel2, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          background:
                            c.score === null ? INK.slate : c.score > 60 ? INK.emerald : c.score > 30 ? INK.amber : INK.slate,
                          width: `${c.score ?? 0}%`,
                        }}
                      />
                    </div>
                    <span style={{ ...NUM_STYLE, width: 32, textAlign: 'right', color: INK.inkFaint }}>
                      {c.score ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: INK.inkFaint }}>
              สินทรัพย์ที่เทรด
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 480, fontSize: 12, borderCollapse: 'collapse' }}>
                <tbody>
                  {meta.signal_map.map((s) => (
                    <tr key={`${s.asset}-${s.direction}`} style={{ borderBottom: `1px solid ${INK.panelBorder}55` }}>
                      <td style={{ ...NUM_STYLE, padding: '6px 12px 6px 0', fontWeight: 600 }}>{s.asset}</td>
                      <td style={{ padding: '6px 12px 6px 0', textTransform: 'capitalize', color: INK.inkFaint }}>{s.category}</td>
                      <td style={{ padding: '6px 12px 6px 0' }}>
                        <DirPill direction={s.direction} />
                      </td>
                      <td style={{ padding: '6px 0', color: INK.inkDim }}>{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function ModelsDashboard() {
  const [data, setData] = useState<ModelsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getModelsDashboard());
    } catch {
      setError('โหลดข้อมูลโมเดลไม่สำเร็จ — ลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    try {
      setData(await refreshModelsDashboard());
    } catch {
      setError('รีเฟรชไม่สำเร็จ — ลองใหม่อีกครั้ง');
    }
  }, []);

  const metaById = useMemo(() => Object.fromEntries((data?.meta ?? []).map((m) => [m.model_id, m])), [data]);

  if (error && !data) {
    return (
      <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 40, textAlign: 'center' }}>
        <p style={{ color: INK.inkDim, fontSize: 13 }}>{error}</p>
        <button onClick={() => void load()} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 8, background: INK.accent, color: '#08131f', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          ลองใหม่
        </button>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ height: 24, width: 240, background: INK.panel2, borderRadius: 6 }} />
        <div style={{ height: 240, background: INK.panel2, borderRadius: 10 }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ height: 96, background: INK.panel2, borderRadius: 10 }} />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>โมเดลทำกำไร</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: INK.inkDim }}>
            Total = โครงสร้างตลาด + มหภาค + ข่าว + ยืนยัน + บทลงโทษ (0-100)
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: INK.inkFaint }}>อัพเดตล่าสุด: {data.updated_at}</span>
          <button
            onClick={() => void refresh()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: INK.panel2, color: INK.ink, border: `1px solid ${INK.panelBorder}`, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            รีเฟรช
          </button>
        </div>
      </div>

      {/* Score history chart */}
      <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 20 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: INK.inkDim }}>ประวัติคะแนนโมเดล (30 วัน)</h4>
        <ScoreHistoryChart history={data.history} meta={data.meta} thresholds={data.thresholds} newsFactorSince={data.news_factor_since} />
        {/* legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
          {data.meta.map((m) => (
            <span key={m.model_id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: INK.inkDim }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: m.color, display: 'inline-block' }} />
              {m.short_th}
            </span>
          ))}
        </div>
      </div>

      {/* Model cards */}
      {data.models.map((model) => {
        const meta = metaById[model.model_id];
        if (!meta) return null;
        return (
          <ModelCard
            key={model.model_id}
            model={model}
            meta={meta}
            expanded={expandedId === model.model_id}
            onToggle={() => setExpandedId(expandedId === model.model_id ? null : model.model_id)}
            factorLabels={data.factor_labels_th}
            statusMeta={data.status_meta}
          />
        );
      })}

      {/* Sources */}
      {data.data_sources.length > 0 && (
        <p style={{ textAlign: 'right', fontSize: 11, color: INK.inkFaint }}>
          แหล่งข้อมูล: {data.data_sources.join(' · ')}
        </p>
      )}
    </div>
  );
}
