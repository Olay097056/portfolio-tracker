import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMacroDashboard, refreshMacroDashboard } from '../../api/client';
import type { MacroDashboard as MacroDashboardData, MacroMetricCard, YieldCurvePoint } from '../../api/types';

// Macro Dashboard — จำลองหน้า /macro ของ bond-crisis-dashboard-v2 ให้เหมือนต้นฉบับ:
// header + ปุ่มรีเฟรช, แบนเนอร์เตือน curve inverted, แผง Yield Curve พร้อมเส้น
// ปัจจุบัน/1 เดือนก่อน + 10Y-2Y, การ์ด Gold CME, และการ์ดเมตริก 5 หมวด
// (ผลตอบแทนพันธบัตร / ตลาดเงิน / ตัวชี้วัดมหภาค / เครดิต / ธนาคาร).
//
// ใช้ชุดสี "ink" ของต้นฉบับโดยเฉพาะ (#101623 panel, #1e2940 border, #38bdf8 accent,
// emerald/red สำหรับ up/down) — จำกัด scope อยู่ภายใน component นี้ ไม่แตะธีมรวมของแอป
// ข้อมูลที่ backend ส่งมาเป็นข้อมูลจริงจาก FRED + Yahoo Finance; ตัวที่ไม่มีแหล่งข้อมูล
// ฟรี (CME OI, MOVE, COT, IV ATM ฯลฯ) จะแสดง "—" อย่างตรงไปตรงมา ไม่มีตัวเลขแต่ง

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
  slate: '#475569',
};

const NUM_STYLE: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

function fmtValue(value: number | null, unit: string): string {
  if (value === null) return '—';
  switch (unit) {
    case '%':
      return `${value.toFixed(2)}%`;
    case 'bps':
      return value.toFixed(0);
    case '$B':
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}B`;
    case 'USD':
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'contracts':
      return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    case 'x':
      return `${value.toFixed(2)}x`;
    case 'notch':
      return value.toFixed(0);
    default:
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

/** The change cell logic mirrors the reference page: "%" cards show bps deltas
 * (change_val × 100), "bps" cards show bps directly, everything else shows %. */
function changeText(card: MacroMetricCard): string | null {
  if (card.unit === '%' && card.change_val !== null) {
    const bps = card.change_val * 100;
    return `${bps > 0 ? '+' : ''}${Math.round(bps)} bps`;
  }
  if (card.unit === 'bps' && card.change_val !== null) {
    return `${card.change_val > 0 ? '+' : ''}${Math.round(card.change_val)} bps`;
  }
  if (card.change_pct !== null) {
    return `${card.change_pct > 0 ? '+' : ''}${card.change_pct.toFixed(2)}%`;
  }
  return null;
}

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'flat') return <span style={{ color: INK.inkFaint }}>—</span>;
  return (
    <span style={{ color: trend === 'up' ? INK.emerald : INK.red, fontWeight: 700, fontSize: '0.7rem' }}>
      {trend === 'up' ? '▲' : '▼'}
    </span>
  );
}

function MetricCard({ card }: { card: MacroMetricCard }) {
  const change = changeText(card);
  const changeColor = !change ? INK.inkFaint : card.trend === 'up' ? INK.emerald : card.trend === 'down' ? INK.red : INK.inkFaint;
  return (
    <div
      style={{
        background: INK.panel,
        border: `1px solid ${INK.panelBorder}`,
        borderRadius: 10,
        padding: '12px 14px',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(56,189,248,0.4)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = INK.panelBorder)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          title={card.name_en}
          style={{ fontSize: '0.7rem', color: INK.inkFaint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {card.name_th}
        </span>
        <span style={{ fontSize: '0.62rem', color: INK.inkFaint, flexShrink: 0 }}>{card.recorded_at ?? ''}</span>
      </div>
      <div style={{ ...NUM_STYLE, fontSize: '1.15rem', fontWeight: 800, color: card.available ? INK.ink : INK.inkFaint, marginTop: 6 }}>
        {fmtValue(card.value, card.unit)}
        {card.available && card.unit === 'bps' && (
          <span style={{ fontSize: '0.65rem', fontWeight: 500, color: INK.inkFaint, marginLeft: 4 }}>bps</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ ...NUM_STYLE, fontSize: '0.72rem', fontWeight: 600, color: changeColor }}>
          {card.available ? (
            <>
              <TrendArrow trend={card.trend} /> {change ?? ''}
            </>
          ) : (
            <span style={{ color: INK.inkFaint }}>ไม่มีข้อมูล</span>
          )}
        </span>
      </div>
    </div>
  );
}

const CHART_W = 880;
const CHART_H = 280;
const PAD_X = 40;
const PAD_TOP = 22;
const PAD_BOTTOM = 30;

function YieldCurveChart({ points }: { points: YieldCurvePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const available = useMemo(
    () => points.filter((p) => p.available && p.yield !== null),
    [points],
  );

  if (available.length < 2) {
    return (
      <div
        style={{
          height: CHART_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: INK.inkFaint,
          fontSize: '0.85rem',
        }}
      >
        — ไม่มีข้อมูลเส้นอัตราผลตอบแทนเพียงพอ
      </div>
    );
  }

  const values = available.map((p) => p.yield as number);
  const prevValues = available.map((p) => p.prev).filter((v): v is number => v !== null);
  const allVals = [...values, ...prevValues];
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const span = maxV - minV || 0.5;
  const plotW = CHART_W - PAD_X * 2;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;

  const xFor = (i: number) => PAD_X + (i / (available.length - 1)) * plotW;
  const yFor = (v: number) => PAD_TOP + ((maxV + span * 0.15 - v) / (span * 1.3)) * plotH;

  const currentPath = available
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.yield as number).toFixed(1)}`)
    .join(' ');
  const areaPath = `${currentPath} L${xFor(available.length - 1).toFixed(1)},${PAD_TOP + plotH} L${xFor(0).toFixed(1)},${PAD_TOP + plotH} Z`;

  // Prev line only where a point has a prev value.
  const prevSegments: string[] = [];
  available.forEach((p, i) => {
    if (p.prev === null) return;
    const cmd = prevSegments.length === 0 ? 'M' : 'L';
    prevSegments.push(`${cmd}${xFor(i).toFixed(1)},${yFor(p.prev).toFixed(1)}`);
  });
  const prevPath = prevSegments.join(' ');

  // 4 horizontal gridlines spanning the visible range.
  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const v = maxV + span * 0.15 - (span * 1.3 * i) / 4;
    return { v, y: PAD_TOP + (plotH * i) / 4 };
  });

  const hoverPoint = hover !== null ? available[hover] : null;

  return (
    <div
      style={{ position: 'relative', overflowX: 'auto' }}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label="Yield curve chart"
        style={{ display: 'block', width: '100%', minWidth: 560 }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * CHART_W;
          const i = Math.round(((x - PAD_X) / plotW) * (available.length - 1));
          setHover(Math.max(0, Math.min(available.length - 1, i)));
        }}
      >
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={PAD_X} x2={CHART_W - PAD_X} y1={g.y} y2={g.y} stroke={INK.panelBorder} strokeWidth={1} strokeDasharray="3 3" />
            <text x={PAD_X - 8} y={g.y + 3.5} textAnchor="end" fontSize={11} fill={INK.inkFaint}>
              {g.v.toFixed(1)}%
            </text>
          </g>
        ))}
        {/* prev line: dashed slate, under the current line */}
        {prevPath && <path d={prevPath} fill="none" stroke={INK.slate} strokeWidth={1.5} strokeDasharray="4 4" />}
        <path d={areaPath} fill={INK.accent} opacity={0.1} />
        <path d={currentPath} fill="none" stroke={INK.accent} strokeWidth={2.5} strokeLinejoin="round" />
        {available.map((p, i) => (
          <circle
            key={p.tenor}
            cx={xFor(i)}
            cy={yFor(p.yield as number)}
            r={hover === i ? 5 : 3.5}
            fill={INK.accent}
            strokeWidth={0}
            opacity={hover === i ? 1 : 0.9}
          />
        ))}
        {/* x labels */}
        {available.map((p, i) => (
          <text key={p.tenor} x={xFor(i)} y={CHART_H - 8} textAnchor="middle" fontSize={11} fill={INK.inkFaint}>
            {p.tenor}
          </text>
        ))}
      </svg>

      {hoverPoint && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: `${(xFor(available.indexOf(hoverPoint)) / CHART_W) * 100}%`,
            transform: 'translateX(-50%)',
            background: INK.panel,
            border: `1px solid ${INK.panelBorder}`,
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            color: INK.inkDim,
            pointerEvents: 'none',
            zIndex: 2,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontWeight: 700, color: INK.ink }}>{hoverPoint.tenor}</div>
          <div style={NUM_STYLE}>
            ปัจจุบัน: <b style={{ color: INK.accent }}>{hoverPoint.yield?.toFixed(3)}%</b>
          </div>
          {hoverPoint.prev !== null && (
            <div style={NUM_STYLE}>
              1 เดือนก่อน: <b style={{ color: INK.slate }}>{hoverPoint.prev.toFixed(3)}%</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 18 }}>
      {children}
    </div>
  );
}

function CmePlaceholderCard({ title, note }: { title: string; note: string }) {
  return (
    <Panel>
      <h3 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: INK.inkDim }}>{title}</h3>
      <div style={{ marginTop: 8, fontSize: '0.72rem', color: INK.inkFaint }}>{note}</div>
    </Panel>
  );
}

export function MacroDashboard() {
  const [data, setData] = useState<MacroDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getMacroDashboard()
      .then((d) => {
        setData(d);
        setActionFailed(false);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleRefresh() {
    setRefreshing(true);
    setActionFailed(false);
    refreshMacroDashboard()
      .then(setData)
      .catch(() => setActionFailed(true))
      .finally(() => setRefreshing(false));
  }

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48, color: INK.inkFaint, fontSize: '0.85rem' }}>
        กำลังโหลดข้อมูลมหภาค…
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 32, textAlign: 'center' }}>
        <div style={{ color: INK.inkDim, fontSize: '0.85rem' }}>โหลดข้อมูลไม่สำเร็จ — เช็คการเชื่อมต่อแล้วลองใหม่</div>
        <button
          type="button"
          onClick={handleRefresh}
          style={{
            marginTop: 14,
            padding: '8px 18px',
            borderRadius: 8,
            border: `1px solid ${INK.panelBorder}`,
            background: INK.panel,
            color: INK.ink,
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  const curve = data.yield_curve;
  const spread = curve.spread_10y2y_bps;
  const anyCard = data.sections.some((s) => s.items.some((i) => i.available));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Header: title + auto-refresh note + refresh button (เหมือนต้นฉบับ) ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: INK.ink }}>ข้อมูลมหภาค</h2>
          <div style={{ fontSize: '0.72rem', color: INK.inkFaint, marginTop: 2 }}>รีเฟรชอัตโนมัติทุก 5 นาที</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.68rem', color: INK.inkFaint }}>อัปเดตล่าสุด {data.updated_at}</span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 8,
              border: `1px solid ${INK.panelBorder}`,
              background: INK.panel,
              padding: '7px 14px',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: INK.inkDim,
              cursor: refreshing ? 'default' : 'pointer',
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing && <span style={{ display: 'inline-block', animation: 'macroSpin 0.8s linear infinite' }}>⟳</span>}
            {refreshing ? 'กำลังรีเฟรช...' : 'รีเฟรช'}
          </button>
        </div>
      </div>

      {actionFailed && <p style={{ margin: 0, fontSize: '0.75rem', color: INK.red }}>รีเฟรชไม่สำเร็จ — ข้อมูลเดิมยังแสดงอยู่ ลองอีกครั้ง</p>}

      {/* ── Inverted curve warning (เหมือนต้นฉบับ) ── */}
      {curve.inverted && spread !== null && (
        <div style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '12px 16px', fontSize: '0.8rem' }}>
          <b style={{ color: INK.red }}>Curve พลิกกลับ (Inverted)</b>{' '}
          <span style={{ color: INK.inkDim }}>
            — 10Y ต่ำกว่า 2Y — สัญญาณเตือนเศรษฐกิจถดถอย (10Y-2Y = <b style={{ ...NUM_STYLE, color: INK.red }}>{spread.toFixed(0)} bps</b>)
          </span>
        </div>
      )}

      {/* ── Yield Curve panel (เหมือนต้นฉบับ) ── */}
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: INK.inkDim }}>Yield Curve (13W → 30Y)</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.7rem', color: INK.inkFaint }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 16, height: 2, background: INK.accent }} /> ปัจจุบัน
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 16, borderTop: `1px dashed ${INK.slate}` }} /> 1 เดือนก่อน
            </span>
            <span style={NUM_STYLE}>
              10Y-2Y:{' '}
              <b style={{ color: spread !== null && spread < 0 ? INK.red : INK.emerald, fontWeight: 700 }}>
                {spread !== null ? `${spread.toFixed(0)} bps` : '—'}
              </b>
            </span>
          </div>
        </div>
        <YieldCurveChart points={curve.points} />
      </Panel>

      {/* ── CME zone card + Gold CME card (โครงสร้างเหมือนต้นฉบับ; ข้อมูลต้องมี
            source ของตัวเอง — แสดงสถานะไม่มีข้อมูลอย่างตรงไปตรงมา) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <CmePlaceholderCard
          title="CME · กรอบที่ตลาดออปชันคาด"
          note="กรอบราคา ±1σ ที่ตลาดออปชันคาด ต้องใช้ข้อมูล IV จาก CME ซึ่งไม่มีแหล่งข้อมูลฟรี — ข้ามรายการนี้ไปก่อน"
        />
        <Panel>
          <h3 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: INK.inkDim }}>ทองคำ CME — สัญญา/วอลุ่ม</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 10 }}>
            {[
              { label: 'Open Interest', value: data.gold_cme.oi },
              { label: 'OI เปลี่ยนวัน', value: data.gold_cme.oi_chg },
              { label: 'วอลุ่ม', value: data.gold_cme.vol },
              { label: 'OI ออปชัน', value: data.gold_cme.opt_oi },
            ].map((t) => (
              <div key={t.label} style={{ background: 'rgba(0,0,0,0.18)', border: `1px solid ${INK.panelBorder}`, borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: '0.62rem', color: INK.inkFaint }}>{t.label}</div>
                <div style={{ ...NUM_STYLE, fontSize: '1rem', fontWeight: 800, color: data.gold_cme.available ? INK.ink : INK.inkFaint, marginTop: 3 }}>
                  {t.value !== null ? t.value.toLocaleString() : '—'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: '0.68rem', color: INK.inkFaint }}>
            {data.gold_cme.note ?? 'ไม่มีข้อมูล'} — yfinance ไม่ให้ Open Interest ของฟิวเจอร์ส
          </div>
        </Panel>
      </div>

      {/* ── 5 หมวด metric cards (เหมือนต้นฉบับ) ── */}
      {data.sections.map((section) => (
        <div key={section.key}>
          <h3 style={{ margin: 0, marginBottom: 12, fontSize: '0.82rem', fontWeight: 600, color: INK.inkDim }}>{section.title_th}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
            {section.items.map((card) => (
              <MetricCard key={card.series_id} card={card} />
            ))}
          </div>
        </div>
      ))}

      <div style={{ fontSize: '0.68rem', color: INK.inkFaint }}>
        {anyCard ? `แหล่งข้อมูล: ${data.data_sources.join(' + ')}` : 'ไม่มีแหล่งข้อมูลในขณะนี้'} · ข้อมูลเพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำการลงทุน
      </div>

      <style>{`@keyframes macroSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
