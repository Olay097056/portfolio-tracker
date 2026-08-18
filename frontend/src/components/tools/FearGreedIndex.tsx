import { useEffect, useState } from 'react';
import { getFearGreed } from '../../api/client';
import type { FearGreed, FearGreedIndicator, FearGreedPoint } from '../../api/types';

// CNN's own bands, confirmed against its live API 2026-08-08 (32.2 -> fear, 50.0 ->
// neutral, 63.7 -> greed, 79.8 -> extreme greed). The backend labels every score with
// these too; they're repeated here only to colour the gauge arc.
const BANDS = [
  { max: 25, label: 'Extreme Fear', color: '#dc2626' },
  { max: 45, label: 'Fear', color: '#f97316' },
  { max: 55, label: 'Neutral', color: '#eab308' },
  { max: 75, label: 'Greed', color: '#84cc16' },
  { max: 100, label: 'Extreme Greed', color: '#16a34a' },
] as const;

const RATING_TH: Record<string, string> = {
  'extreme fear': 'กลัวสุดขีด',
  fear: 'กลัว',
  neutral: 'เป็นกลาง',
  greed: 'โลภ',
  'extreme greed': 'โลภสุดขีด',
};

export function colorForScore(score: number): string {
  return (BANDS.find((b) => score < b.max) ?? BANDS[BANDS.length - 1]).color;
}

function ratingLabel(rating: string | null): string {
  if (!rating) return '—';
  const key = rating.toLowerCase();
  const thai = RATING_TH[key];
  const english = key.replace(/\b\w/g, (c) => c.toUpperCase());
  return thai ? `${english} (${thai})` : english;
}

const GAUGE_WIDTH = 320;
const GAUGE_HEIGHT = 180;
const GAUGE_CX = GAUGE_WIDTH / 2;
const GAUGE_CY = 158;
const GAUGE_RADIUS = 118;
const GAUGE_THICKNESS = 26;

/** Point on the gauge arc for a 0-100 score. The dial sweeps 180deg, left (0) to right (100). */
function polarPoint(score: number, radius: number): { x: number; y: number } {
  const angle = Math.PI * (1 - Math.min(100, Math.max(0, score)) / 100);
  return { x: GAUGE_CX + radius * Math.cos(angle), y: GAUGE_CY - radius * Math.sin(angle) };
}

function arcPath(fromScore: number, toScore: number, radius: number, thickness: number): string {
  const outer = radius + thickness / 2;
  const inner = radius - thickness / 2;
  const a = polarPoint(fromScore, outer);
  const b = polarPoint(toScore, outer);
  const c = polarPoint(toScore, inner);
  const d = polarPoint(fromScore, inner);
  return `M ${a.x} ${a.y} A ${outer} ${outer} 0 0 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 0 0 ${d.x} ${d.y} Z`;
}

function Gauge({ score, rating }: { score: number; rating: string | null }) {
  const needle = polarPoint(score, GAUGE_RADIUS + GAUGE_THICKNESS / 2 - 6);
  const color = colorForScore(score);

  return (
    <svg
      width={GAUGE_WIDTH}
      height={GAUGE_HEIGHT}
      viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`}
      role="img"
      aria-label={`Fear and Greed score ${score.toFixed(0)} out of 100, ${rating ?? 'unknown'}`}
    >
      {BANDS.map((band, idx) => {
        const from = idx === 0 ? 0 : BANDS[idx - 1].max;
        return (
          <path
            key={band.label}
            d={arcPath(from, band.max, GAUGE_RADIUS, GAUGE_THICKNESS)}
            fill={band.color}
            opacity={score >= from && score < band.max ? 1 : 0.28}
          />
        );
      })}

      <line
        x1={GAUGE_CX}
        y1={GAUGE_CY}
        x2={needle.x}
        y2={needle.y}
        stroke={color}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <circle cx={GAUGE_CX} cy={GAUGE_CY} r={8} fill={color} />

      <text x={GAUGE_CX} y={GAUGE_CY - 44} textAnchor="middle" fontSize="44" fontWeight="800" fill={color}>
        {score.toFixed(0)}
      </text>
      <text x={GAUGE_CX} y={GAUGE_CY - 22} textAnchor="middle" fontSize="12" fill="var(--text-muted)">
        จาก 100
      </text>

      <text x={GAUGE_CX - GAUGE_RADIUS - 6} y={GAUGE_CY + 18} textAnchor="middle" fontSize="10" fill="var(--text-dim)">0</text>
      <text x={GAUGE_CX + GAUGE_RADIUS + 6} y={GAUGE_CY + 18} textAnchor="middle" fontSize="10" fill="var(--text-dim)">100</text>
    </svg>
  );
}

/** Plain polyline sparkline. Flat series get a mid-height line rather than a divide-by-zero. */
function Sparkline({ points, color, width = 190, height = 42 }: { points: FearGreedPoint[]; color: string; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = span === 0 ? height / 2 : height - ((p.value - min) / span) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Year-long score history. Band colours are drawn as horizontal guides behind the line. */
function HistoryChart({ points }: { points: FearGreedPoint[] }) {
  const width = 900;
  const height = 180;
  if (points.length < 2) return null;

  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - (Math.min(100, Math.max(0, p.value)) / 100) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block' }}
        role="img"
        aria-label="Fear and Greed score over the past year"
      >
        {BANDS.map((band, idx) => {
          const from = idx === 0 ? 0 : BANDS[idx - 1].max;
          const y = height - (band.max / 100) * height;
          return (
            <rect
              key={band.label}
              x={0}
              y={y}
              width={width}
              height={((band.max - from) / 100) * height}
              fill={band.color}
              opacity={0.08}
            />
          );
        })}
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--border)" strokeDasharray="4 4" />
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** The band a raw score falls in. Mirrors the backend's bands so a historical comparison
 *  point can be labelled without the API having to send a rating for each one. */
export function bandLabelForScore(score: number): string {
  return (BANDS.find((b) => score < b.max) ?? BANDS[BANDS.length - 1]).label;
}

function ComparisonCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="glass-stat-card" style={{ textAlign: 'center', minWidth: '120px', flex: 1 }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>{label}</div>
      {value == null ? (
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-dim)' }}>—</div>
      ) : (
        <>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: colorForScore(value) }}>{value.toFixed(0)}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{bandLabelForScore(value)}</div>
        </>
      )}
    </div>
  );
}

function IndicatorCard({ indicator }: { indicator: FearGreedIndicator }) {
  const color = indicator.score != null ? colorForScore(indicator.score) : 'var(--text-dim)';
  return (
    <div
      className="card"
      style={{
        margin: 0,
        padding: '16px',
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.35 }}>{indicator.label}</div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 800, color }}>
          {indicator.score != null ? indicator.score.toFixed(0) : '—'}
        </span>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>{ratingLabel(indicator.rating)}</span>
      </div>

      {indicator.latest_value != null && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          ค่าล่าสุด: <strong style={{ color: 'var(--text)' }}>{indicator.latest_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
        </div>
      )}

      <Sparkline points={indicator.series} color={color} />
    </div>
  );
}

export function FearGreedIndex() {
  const [data, setData] = useState<FearGreed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    getFearGreed()
      .then((result) => {
        if (isMounted) setData(result);
      })
      .catch(() => {
        if (isMounted) setError('ไม่สามารถดึงข้อมูล Fear & Greed ได้ในขณะนี้');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="card glass-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
        กำลังโหลดดัชนี Fear &amp; Greed…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card glass-panel" style={{ padding: '32px' }}>
        <div role="alert">{error ?? 'ไม่มีข้อมูล'}</div>
      </div>
    );
  }

  const updatedAt = data.updated_at ? new Date(data.updated_at) : null;
  const updatedLabel = updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt.toLocaleString('th-TH') : '—';

  return (
    <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>😱 ดัชนีความกลัว-ความโลภ (Fear &amp; Greed Index)</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            วัดอารมณ์ตลาดหุ้นอเมริกาเป็นคะแนน 0–100 · ยิ่งต่ำยิ่งกลัว ยิ่งสูงยิ่งโลภ
          </p>
        </div>
        <span
          className={`badge ${data.source === 'cnn' ? 'badge-blue' : 'badge-amber'}`}
          style={{ fontSize: '0.75rem', padding: '5px 12px' }}
        >
          {data.source === 'cnn' ? 'ข้อมูลจาก CNN' : 'คำนวณสำรองโดยแอปนี้'}
        </span>
      </div>

      {/* When CNN is unreachable the number on screen is a different index entirely -- say
          so outright rather than letting it read as "the" Fear & Greed score. */}
      {data.source === 'computed' && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            fontSize: '0.8rem',
            color: '#fcd34d',
            lineHeight: 1.55,
          }}
        >
          ⚠️ ตอนนี้ดึงข้อมูลจาก CNN ไม่ได้ กำลังแสดง<strong>ดัชนีสำรองที่แอปนี้คำนวณเอง</strong>จากตัวชี้วัด{' '}
          {data.indicators.length} ตัว (CNN ใช้ 7 ตัว) — <strong>คะแนนจะไม่ตรงกับของ CNN</strong> และไม่มีข้อมูลย้อนหลังให้เทียบ
        </div>
      )}

      {/* ── Gauge + rating ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '24px' }}>
        <Gauge score={data.score} rating={data.rating} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>
            สถานะตลาดตอนนี้
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: colorForScore(data.score) }}>
            {ratingLabel(data.rating)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '8px' }}>
            อัปเดตล่าสุด: {updatedLabel}
          </div>
        </div>
      </div>

      {/* ── Comparison points (CNN only) ── */}
      {data.previous_close != null && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <ComparisonCard label="ปิดครั้งก่อน" value={data.previous_close} />
          <ComparisonCard label="1 สัปดาห์ก่อน" value={data.previous_1_week} />
          <ComparisonCard label="1 เดือนก่อน" value={data.previous_1_month} />
          <ComparisonCard label="1 ปีก่อน" value={data.previous_1_year} />
        </div>
      )}

      {/* ── One-year history ── */}
      {data.history.length > 1 && (
        <div>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)' }}>
            📈 ย้อนหลัง 1 ปี
          </h4>
          <HistoryChart points={data.history} />
        </div>
      )}

      {/* ── Component indicators ── */}
      <div>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)' }}>
          🧭 ตัวชี้วัดย่อย ({data.indicators.length} ตัว)
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          {data.indicators.map((indicator) => (
            <IndicatorCard key={indicator.key} indicator={indicator} />
          ))}
        </div>
      </div>

      <p style={{ margin: 0, fontSize: '0.73rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
        {data.source === 'cnn'
          ? 'ข้อมูลและคะแนนทั้งหมดมาจาก CNN Business Fear & Greed Index · ตัวเลขบนกราฟย่อยคือค่าดิบของตัวชี้วัดนั้น ไม่ใช่คะแนน 0–100'
          : 'ดัชนีสำรองนี้แอปคำนวณเองจากข้อมูลตลาดจริง (yfinance) ด้วยเกณฑ์ของแอปเอง ไม่ใช่สูตรของ CNN ซึ่งไม่ได้เปิดเผย'}{' '}
        · ดัชนีนี้สะท้อนอารมณ์ตลาดโดยรวม ไม่ใช่คำแนะนำการลงทุน
      </p>
    </div>
  );
}
