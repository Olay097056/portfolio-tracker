import { useCallback, useEffect, useMemo, useState } from 'react';
import { getNews, refreshNews } from '../../api/client';
import type { NewsItem, NewsList } from '../../api/types';

// Ink palette — same constants as ModelsDashboard/SignalsDashboard (no
// Tailwind in this app; inline styles matching the reference dark theme).
const INK = {
  bg: '#0a0f16',
  panel: '#101623',
  panel2: '#151d2c',
  edge: '#1e2940',
  ink: '#e2e8f0',
  inkDim: '#94a3b8',
  inkFaint: '#5a6b85',
  accent: '#38bdf8',
  up: '#34d399',
  down: '#f87171',
  warn: '#f59e0b',
} as const;

// Per-model badge colors, same as the reference site's news page.
const MODEL_BADGES: Record<string, { bg: string; fg: string }> = {
  'recovery-reflation': { bg: 'rgba(56,189,248,0.15)', fg: '#38bdf8' },
  'inflation-oil': { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b' },
  'fed-pivot': { bg: 'rgba(167,139,250,0.15)', fg: '#a78bfa' },
  'yield-shock': { bg: 'rgba(249,115,22,0.15)', fg: '#f97316' },
  'credit-panic': { bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
  'bank-run': { bg: 'rgba(52,211,153,0.15)', fg: '#34d399' },
};

const MODEL_TH: Record<string, string> = {
  'recovery-reflation': 'ฟื้นตัว/รีเฟลชัน',
  'inflation-oil': 'เงินเฟ้อ/น้ำมัน',
  'fed-pivot': 'Fed pivot',
  'yield-shock': 'Yield ช็อก',
  'credit-panic': 'วิกฤตสินเชื่อ',
  'bank-run': 'Bank run',
};

const CATEGORY_TH: Record<string, string> = {
  market: 'ตลาด',
  bond: 'พันธบัตร',
  crypto: 'คริปโต',
  world: 'โลก',
  war: 'สงคราม',
  economy: 'เศรษฐกิจ',
  energy: 'พลังงาน',
  thai: 'ไทย',
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.ที่แล้ว`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d} วันที่แล้ว`;
  return new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function impactColor(score: number | null): string {
  if (score === null) return INK.inkFaint;
  if (score >= 70) return INK.down; // regime-changing — red-hot
  if (score >= 40) return INK.warn;
  if (score >= 15) return INK.accent;
  return INK.inkFaint;
}

function NewsCard({
  item,
  expanded,
  onToggle,
}: {
  item: NewsItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const title = item.title_th || item.title;
  const hasAnalysis = Boolean(item.analysis_th);
  return (
    <div
      style={{
        background: INK.panel,
        border: `1px solid ${INK.edge}`,
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Impact score block */}
        <div style={{ minWidth: 44, textAlign: 'center' }}>
          <div style={{ fontSize: '0.68rem', color: INK.inkFaint }}>IMPACT</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: impactColor(item.impact_score) }}>
            {item.impact_score ?? '—'}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: INK.accent, textTransform: 'uppercase' }}>
              {item.source}
            </span>
            <span style={{ fontSize: '0.72rem', color: INK.inkFaint }}>• {timeAgo(item.published_at)}</span>
            {item.category ? (
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '1px 8px',
                  borderRadius: 999,
                  background: 'rgba(56,189,248,0.10)',
                  color: INK.inkDim,
                  border: `1px solid ${INK.edge}`,
                }}
              >
                {CATEGORY_TH[item.category] || item.category}
              </span>
            ) : null}
            {item.related_models?.map((m) => {
              const badge = MODEL_BADGES[m] || MODEL_BADGES['fed-pivot'];
              return (
                <span
                  key={m}
                  style={{ fontSize: '0.66rem', padding: '1px 8px', borderRadius: 999, background: badge.bg, color: badge.fg, fontWeight: 600 }}
                  title={m}
                >
                  {MODEL_TH[m] || m}
                </span>
              );
            })}
          </div>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: INK.ink, textDecoration: 'none', fontWeight: 700, fontSize: '0.95rem', display: 'block', marginTop: 6 }}
            onClick={(e) => e.stopPropagation()}
          >
            {title}
            <span style={{ marginLeft: 6, fontSize: '0.75rem', color: INK.inkFaint }}>↗</span>
          </a>
          {item.summary && item.title_th ? (
            <div style={{ fontSize: '0.82rem', color: INK.inkDim, marginTop: 6, lineHeight: 1.5 }}>
              {item.summary.length > 220 ? `${item.summary.slice(0, 220)}…` : item.summary}
            </div>
          ) : null}
          {hasAnalysis ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              style={{
                marginTop: 8,
                background: 'transparent',
                border: 'none',
                color: INK.accent,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {expanded ? '▲ ซ่อนบทวิเคราะห์' : '▼ บทวิเคราะห์'}
            </button>
          ) : null}
          {expanded && hasAnalysis ? (
            <div
              style={{
                marginTop: 8,
                padding: '10px 12px',
                background: INK.panel2,
                border: `1px solid ${INK.edge}`,
                borderRadius: 8,
                fontSize: '0.85rem',
                color: INK.ink,
                lineHeight: 1.65,
              }}
            >
              {item.analysis_th}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function NewsDashboard() {
  const [data, setData] = useState<NewsList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'date' | 'impact'>('date');
  const [source, setSource] = useState('');
  const [minImpact, setMinImpact] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const d = await getNews(page, sort, source || undefined, minImpact ?? undefined);
      setData(d);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, sort, source, minImpact]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshNews();
      await load();
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  };

  const pages = data?.pages ?? 1;
  const pageNumbers = useMemo(() => {
    const nums: (number | '…')[] = [];
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
      else if (nums[nums.length - 1] !== '…') nums.push('…');
    }
    return nums;
  }, [pages, page]);

  return (
    <div style={{ background: INK.bg, minHeight: '100%' }}>
      {/* Header row: title + controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: INK.ink }}>📰 ข่าวสาร</div>
        <span style={{ fontSize: '0.75rem', color: INK.inkFaint }}>
          {data ? `${data.count.toLocaleString()} ข่าว • อัปเดต ${data.updated_at}` : '…'}
        </span>
        <div style={{ flex: 1 }} />
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as 'date' | 'impact');
            setPage(1);
          }}
          style={selectStyle}
        >
          <option value="date">เรียงตามวันที่</option>
          <option value="impact">เรียงตาม IMPACT</option>
        </select>
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPage(1);
          }}
          style={selectStyle}
        >
          <option value="">ทุกแหล่ง</option>
          {(data?.sources ?? []).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={minImpact ?? ''}
          onChange={(e) => {
            setMinImpact(e.target.value === '' ? null : Number(e.target.value));
            setPage(1);
          }}
          style={selectStyle}
        >
          <option value="">IMPACT ≥ ใดก็ได้</option>
          <option value="15">IMPACT ≥ 15</option>
          <option value="40">IMPACT ≥ 40</option>
          <option value="60">IMPACT ≥ 60</option>
        </select>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: `1px solid ${INK.edge}`,
            background: INK.panel,
            color: INK.ink,
            fontWeight: 600,
            fontSize: '0.8rem',
            cursor: refreshing ? 'wait' : 'pointer',
          }}
        >
          {refreshing ? 'กำลังรีเฟรช…' : '⟳ รีเฟรช'}
        </button>
      </div>

      {/* Loading / error / empty states */}
      {loading ? (
        <div style={{ color: INK.inkDim, padding: '40px 0', textAlign: 'center', fontSize: '0.9rem' }}>
          กำลังโหลดข่าว…
        </div>
      ) : error ? (
        <div style={{ color: INK.down, padding: '40px 0', textAlign: 'center', fontSize: '0.9rem' }}>
          โหลดข่าวไม่สำเร็จ — ลองอีกครั้ง
          <div style={{ marginTop: 10 }}>
            <button onClick={() => void load()} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${INK.edge}`, background: INK.panel, color: INK.ink, cursor: 'pointer', fontSize: '0.8rem' }}>
              ลองใหม่
            </button>
          </div>
        </div>
      ) : data && data.items.length === 0 ? (
        <div style={{ color: INK.inkDim, padding: '40px 0', textAlign: 'center', fontSize: '0.9rem' }}>
          ยังไม่มีข่าว — กดรีเฟรชเพื่อดึงข่าวล่าสุด
        </div>
      ) : (
        <>
          {(data?.items ?? []).map((item) => (
            <NewsCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            />
          ))}

          {/* Pagination */}
          {pages > 1 ? (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                style={pageBtnStyle(page > 1)}
              >
                ‹
              </button>
              {pageNumbers.map((n, i) =>
                n === '…' ? (
                  <span key={`e${i}`} style={{ color: INK.inkFaint, padding: '6px 4px' }}>…</span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    style={{
                      ...pageBtnStyle(true),
                      background: n === page ? INK.accent : INK.panel,
                      color: n === page ? '#fff' : INK.inkDim,
                      fontWeight: n === page ? 700 : 500,
                    }}
                  >
                    {n}
                  </button>
                ),
              )}
              <button
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
                style={pageBtnStyle(page < pages)}
              >
                ›
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: 8,
  border: `1px solid ${INK.edge}`,
  background: INK.panel,
  color: INK.ink,
  fontSize: '0.8rem',
  cursor: 'pointer',
};

function pageBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 8,
    border: `1px solid ${INK.edge}`,
    background: INK.panel,
    color: INK.inkDim,
    fontSize: '0.85rem',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.4,
  };
}
