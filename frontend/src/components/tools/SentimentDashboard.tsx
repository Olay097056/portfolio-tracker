import { useCallback, useEffect, useState } from 'react';
import { RiskBanner } from './RiskBanner';
import { getFearGreed } from '../../api/client';
import type { FearGreed, FearGreedIndicator } from '../../api/types';

// อารมณ์ตลาด — หน้า /sentiment ของ reference:
// CNN Fear & Greed + Crypto Fear & Greed + 4 ตัวชี้วัด (indicators) +
// แนวโน้มย้อนหลัง 1 ปี — ใช้ข้อมูลจริงจาก /api/fear-greed
// ชุดสี "ink" ของต้นฉบับ — scope ภายใน component นี้เท่านั้น

const INK = {
  panel: 'var(--panel)',
  panelBorder: 'var(--border)',
  ink: 'var(--text)',
  inkDim: 'var(--text-muted)',
  inkFaint: 'var(--text-dim)',
  accent:'var(--primary)',
  emerald: '#34d399',
  red: '#f87171',
  amber: '#fbbf24',
};

const NUM_STYLE: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

function fgColor(score: number | null): string {
  if (score === null) return INK.inkFaint;
  if (score >= 75) return INK.emerald;   // extreme greed
  if (score >= 55) return '#4ade80';     // greed
  if (score >= 45) return INK.amber;     // neutral
  if (score >= 25) return '#fb923c';     // fear
  return INK.red;                        // extreme fear
}

function fgLabel(score: number | null, rating: string | null): string {
  if (rating) return rating;
  if (score === null) return '—';
  if (score >= 75) return 'Extreme Greed';
  if (score >= 55) return 'Greed';
  if (score >= 45) return 'Neutral';
  if (score >= 25) return 'Fear';
  return 'Extreme Fear';
}

function Panel({ title, right, children }: {
  title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: INK.panel, border: `1px solid ${INK.panelBorder}`,
      borderRadius: 12, padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.inkFaint }}>
          {title}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Gauge({ score, label }: { score: number | null; label: string }) {
  const color = fgColor(score);
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{
        width: 120, height: 120, margin: '0 auto', borderRadius: '50%',
        border: `10px solid ${color}`, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 24px ${color}33`,
      }}>
        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: INK.ink, ...NUM_STYLE }}>
          {score !== null && score !== undefined ? Math.round(score) : '—'}
        </div>
        <div style={{ fontSize: '0.7rem', color: INK.inkDim, fontWeight: 700 }}>{label}</div>
      </div>
    </div>
  );
}

function HistoryChart({ history }: { history: { t: number; value: number }[] }) {
  if (!history || history.length < 2) {
    return <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK.inkFaint, fontSize: '0.85rem' }}>—</div>;
  }
  const W = 640, H = 140, PAD = 8;
  const vals = history.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = Math.max(max - min, 0.0001);
  const x = (i: number) => PAD + (i / (history.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 140 }} preserveAspectRatio="none">
      <polyline points={history.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
        fill="none" stroke={INK.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {/* 50 = neutral guideline */}
      <line x1={PAD} x2={W - PAD} y1={y(50)} y2={y(50)} stroke={INK.panelBorder} strokeWidth={1} strokeDasharray="4 4" />
    </svg>
  );
}

function IndicatorCard({ ind }: { ind: FearGreedIndicator }) {
  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 10, padding: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: INK.ink }}>{ind.label}</span>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6,
          background: `${fgColor(ind.score)}22`, color: fgColor(ind.score),
        }}>
          {ind.score !== null && ind.score !== undefined ? Math.round(ind.score) : '—'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, background: INK.panelBorder, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, Math.max(0, ind.score ?? 0))}%`, height: '100%',
            background: fgColor(ind.score),
          }} />
        </div>
        <span style={{ fontSize: '0.68rem', color: INK.inkFaint, ...NUM_STYLE }}>
          {ind.latest_value !== null && ind.latest_value !== undefined ? ind.latest_value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ''}
        </span>
      </div>
    </div>
  );
}

export function SentimentDashboard() {
  const [data, setData] = useState<FearGreed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getFearGreed();
      setData(d);
      setError(null);
    } catch {
      setError('โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ color: INK.inkDim, padding: 24 }}>กำลังโหลดอารมณ์ตลาด…</div>;
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

  const crypto = data.crypto_fear_greed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 🚫 Risk warning (D11 — ticket 06) */}
      <RiskBanner id="sentiment" />
      {/* ── 2 ดัชนีหลัก ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <Panel title="ดัชนีความกลัว-ความโลภ (CNN)" right={
          <span style={{ fontSize: '0.68rem', color: INK.inkFaint }}>{data.source === 'cnn' ? 'CNN' : 'computed'} · {data.updated_at}</span>
        }>
          <Gauge score={data.score} label={fgLabel(data.score, data.rating)} />
        </Panel>
        <Panel title="Crypto Fear & Greed" right={
          crypto ? <span style={{ fontSize: '0.68rem', color: INK.inkFaint }}>alternative.me</span> : undefined
        }>
          {crypto ? (
            <>
              <Gauge score={crypto.score} label={fgLabel(crypto.score, crypto.rating)} />
              {crypto.previous !== null && crypto.previous !== undefined && (
                <div style={{ textAlign: 'center', fontSize: '0.72rem', color: INK.inkDim, marginTop: 8 }}>
                  วานนี้: {Math.round(crypto.previous)} ({fgLabel(crypto.previous, null)})
                </div>
              )}
            </>
          ) : <div style={{ color: INK.inkFaint, textAlign: 'center', padding: 20 }}>—</div>}
        </Panel>
      </div>

      {/* ── 4 ตัวชี้วัด ── */}
      <Panel title="ตัวชี้วัดความเชื่อมั่น" right={<span style={{ fontSize: '0.68rem', color: INK.inkFaint }}>5 องค์ประกอบของ CNN</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {data.indicators.map((ind) => <IndicatorCard key={ind.key} ind={ind} />)}
        </div>
      </Panel>

      {/* ── แนวโน้ม 1 ปี ── */}
      <Panel title="แนวโน้มย้อนหลัง" right={
        <span style={{ fontSize: '0.68rem', color: INK.inkFaint }}>
          {data.previous_1_year !== null && data.previous_1_year !== undefined
            ? `1 ปีก่อน: ${Math.round(data.previous_1_year)}` : ''}
        </span>
      }>
        <HistoryChart history={data.history} />
      </Panel>
    </div>
  );
}
