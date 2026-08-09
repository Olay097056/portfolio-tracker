import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCountriesDashboard, refreshCountriesDashboard } from '../../api/client';
import type { CountriesDashboard as CountriesData, CountryCard } from '../../api/types';

// Countries tab (รายประเทศ) — mirrors the reference /countries page: 27
// country cards with 10Y yield, computed risk score, bps-vs-US, progress bar
// and 60-day sparkline, sortable by risk. Missing values render "—".

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
  white: '#ffffff',
};

const LEVEL_META: Record<string, { label: string; bg: string; color: string }> = {
  low: { label: 'เสี่ยงต่ำ', bg: 'rgba(16,185,129,0.15)', color: '#34d399' },
  medium: { label: 'เสี่ยงปานกลาง', bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
  high: { label: 'เสี่ยงสูง', bg: 'rgba(249,115,22,0.15)', color: '#fb923c' },
  'crisis-watch': { label: 'เฝ้าระวังวิกฤต', bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
};

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return String(Math.round(value));
}

function levelBadge(level: string | null | undefined) {
  const meta = LEVEL_META[level ?? ''] ?? LEVEL_META.low;
  return (
    <span
      style={{
        borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
        background: meta.bg, color: meta.color, whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
}

function barColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return INK.panel2;
  if (score >= 75) return INK.red;
  if (score >= 55) return INK.orange;
  if (score >= 30) return INK.amber;
  return INK.emerald;
}

// ── 60-day sparkline (hand-rolled SVG) ───────────────────────────────────
function Sparkline({ points, up }: { points: { date: string; value: number }[]; up: boolean }) {
  const W = 130;
  const H = 26;
  if (points.length < 2) {
    return <span style={{ color: INK.inkFaint, fontSize: 10 }}>—</span>;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 2 - ((v - min) / span) * (H - 4);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const stroke = up ? '#f87171' : '#34d399'; // strokeUp when trend rises (risk up = red)
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="60-day score trend">
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} />
    </svg>
  );
}

// ── Country card ──────────────────────────────────────────────────────────
function CountryCard({ country }: { country: CountryCard }) {
  const score = country.score;
  const barW = score === null || score === undefined ? 3 : Math.max(3, Math.min(100, score));
  const trendUp = (() => {
    const t = country.trend;
    if (t.length < 2) return false;
    return t[t.length - 1].value > t[0].value;
  })();

  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header: flag + name + code·currency + level badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 26, lineHeight: 1 }}>{country.flag}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {country.name_th}
            </div>
            <div style={{ fontSize: 11, color: INK.inkFaint }}>
              {country.code} · {country.currency}
            </div>
          </div>
        </div>
        {country.level && levelBadge(country.level)}
      </div>

      {/* Score + 10Y yield + bps vs US */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: INK.inkFaint }}>
            คะแนนความเสี่ยงประเทศ
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, color: score === null ? INK.inkFaint : INK.text }}>
            {fmtInt(score)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: INK.inkFaint }}>10Y</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: country.yield_value === null ? INK.inkFaint : INK.text }}>
            {country.yield_value === null ? '—' : `${fmt(country.yield_value, 2)}%`}
          </div>
          {country.bps_vs_us !== null && country.bps_vs_us !== undefined && (
            <div style={{ fontSize: 11, color: country.bps_vs_us > 0 ? INK.amber : INK.sky }}>
              {country.bps_vs_us > 0 ? '+' : ''}
              {fmtInt(country.bps_vs_us)} bps vs US
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, borderRadius: 999, background: INK.panel2, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%', borderRadius: 999, background: barColor(score),
            width: `${barW}%`, transition: 'width 0.3s',
          }}
        />
      </div>

      {/* Sparkline + data tier */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 10, color: INK.inkFaint }}>คะแนนย้อนหลัง 60 วัน</span>
        <Sparkline points={country.trend} up={trendUp} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: INK.inkFaint }}>
        <span>
          {country.data_tier_note_th}
          {country.yield_stale && <span style={{ color: INK.orange }}> · ข้อมูลเก่า</span>}
        </span>
        <span>→</span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
type SortKey = 'default' | 'desc' | 'asc';

export function CountriesDashboard() {
  const [data, setData] = useState<CountriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<SortKey>(() => {
    try {
      const saved = localStorage.getItem('bcd-countries-sort');
      return saved === 'desc' || saved === 'asc' ? saved : 'default';
    } catch {
      return 'default';
    }
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await getCountriesDashboard());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000); // refreshMs 300000
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await refreshCountriesDashboard());
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const setSortKey = useCallback((key: SortKey) => {
    setSort(key);
    try {
      localStorage.setItem('bcd-countries-sort', key);
    } catch {
      /* ignore */
    }
  }, []);

  const sorted = useMemo(() => {
    if (!data) return [];
    if (sort === 'default') return data.countries;
    const score = (c: CountryCard) => c.score;
    return [...data.countries].sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      if (sa === null && sb === null) return 0;
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sort === 'desc' ? sb - sa : sa - sb;
    });
  }, [data, sort]);

  if (loading && !data) {
    return <div style={{ color: INK.inkFaint, padding: '40px 0' }}>กำลังโหลดข้อมูลรายประเทศ…</div>;
  }
  if (error && !data) {
    return (
      <div style={{ padding: '24px 0' }}>
        <div style={{ color: INK.red, marginBottom: 12 }}>โหลดข้อมูลไม่สำเร็จ</div>
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${INK.panelBorder}`, background: INK.panel, color: INK.text, cursor: 'pointer' }}>
          ลองใหม่
        </button>
      </div>
    );
  }
  if (!data) return null;

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'default', label: 'มาตรฐาน' },
    { key: 'desc', label: 'เสี่ยงมาก→น้อย' },
    { key: 'asc', label: 'เสี่ยงน้อย→มาก' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>รายประเทศ</h3>
          <span style={{ fontSize: 12, color: INK.inkFaint }}>คะแนนความเสี่ยงประเทศ</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Sort toggle */}
          <div style={{ display: 'flex', borderRadius: 8, border: `1px solid ${INK.panelBorder}`, padding: 2, fontSize: 11 }}>
            {sortOptions.map((o) => (
              <button
                key={o.key}
                onClick={() => setSortKey(o.key)}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: sort === o.key ? INK.panel2 : 'transparent',
                  color: sort === o.key ? INK.text : INK.inkFaint,
                  fontWeight: sort === o.key ? 600 : 400,
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${INK.panelBorder}`, background: INK.panel, color: INK.text, cursor: refreshing ? 'wait' : 'pointer', fontSize: 13 }}
          >
            {refreshing ? 'กำลังรีเฟรช…' : '↻ รีเฟรช'}
          </button>
        </div>
      </div>

      {/* Country cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {sorted.map((c) => <CountryCard key={c.code} country={c} />)}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: INK.inkFaint }}>
        <span>อัพเดตล่าสุด: {data.updated_at}</span>
        <span>{data.data_sources.join(' · ')}</span>
      </div>
    </div>
  );
}
