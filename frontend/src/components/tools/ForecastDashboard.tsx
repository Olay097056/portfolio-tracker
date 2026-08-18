import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getModelsDashboard, simulateModels } from '../../api/client';
import type { ModelsDashboard, SimulateResponse, SimulatedModel, SliderSpec } from '../../api/types';

// Ink palette (project-wide, no Tailwind)
const INK = {
  bg:'var(--bg)',
  panel:'var(--panel)',
  panel2: '#0d1320',
  border: '#1f2937',
  ink:'var(--text)',
  faint:'var(--text-dim)',
  accent:'var(--primary)',
  accent2: '#f59e0b',
  emerald: '#34d399',
  red: '#f87171',
  orange: '#fb923c',
  amber: '#fbbf24',
} as const;

const MODEL_SHORT_TH: Record<string, string> = {
  'recovery-reflation': 'ฟื้นตัว',
  'inflation-oil': 'เงินเฟ้อ/น้ำมัน',
  'fed-pivot': 'Fed เปลี่ยนทิศ',
  'yield-shock': 'Yield ช็อก',
  'credit-panic': 'วิกฤตสินเชื่อ',
  'bank-run': 'แบงก์รัน',
};

const STATUS_TH: Record<string, string> = {
  inactive: 'ไม่ทำงาน',
  building: 'กำลังก่อตัว',
  active: 'ทำงาน',
};

// Slider groups per the prototype (section titles in Thai)
const SLIDER_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'อัตราดอกเบี้ย', keys: ['fedBps', 'sofrSpreadBps', 'debtPts', 'auctionBtc'] },
  { title: 'ความผันผวน / สินค้าโภคภัณฑ์', keys: ['vixPts', 'oilPct', 'goldPct'] },
  { title: 'เครดิต / เงินเฟ้อ', keys: ['hyBps', 'cpiPts'] },
  { title: 'สภาพคล่องธนาคาร', keys: ['depositPct', 'dwBillion'] },
];

const NEWS_MODELS = [
  'bank-run',
  'yield-shock',
  'credit-panic',
  'inflation-oil',
  'fed-pivot',
  'recovery-reflation',
] as const;

const PRESETS: { label: string; values: Record<string, number> }[] = [
  { label: '🛢️ น้ำมันช็อก', values: { oilPct: 50, vixPts: 8, hyBps: 100, goldPct: 15, cpiPts: 1 } },
  { label: '🏦 เฟดช็อก', values: { fedBps: 150, vixPts: 12, hyBps: 150, auctionBtc: 2.0, sofrSpreadBps: 10 } },
  { label: '💳 วิกฤตเครดิต', values: { hyBps: 350, vixPts: 22, sofrSpreadBps: 40, debtPts: 8, auctionBtc: 1.9, dwBillion: 25, 'news-credit-panic': 80 } },
  { label: '🏃 เงินฝากไหลออก', values: { depositPct: -2.5, dwBillion: 80, sofrSpreadBps: 60, vixPts: 15, hyBps: 200, 'news-bank-run': 90 } },
  { label: '📈 รีเฟลชัน', values: { fedBps: -100, oilPct: 20, cpiPts: 1.25, hyBps: -75, auctionBtc: 3.0, 'news-recovery-reflation': 60 } },
];

const DEBOUNCE_MS = 250;

function SliderRow({ spec, value, onChange, showCurrent }: {
  spec: SliderSpec; value: number; onChange: (v: number) => void; showCurrent?: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
        <span>{spec.label_th}</span>
        <span style={{ color: INK.accent, fontWeight: 600 }}>
          {value}
          {spec.unit === 'x' ? ' x' : spec.unit === '%' ? '%' : spec.unit === 'bps' ? ' bps' : spec.unit === 'pts' ? ' pts' : ` ${spec.unit}`}
        </span>
      </div>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: INK.accent, background: 'transparent' }}
      />
      {showCurrent !== undefined && (
        <div style={{ fontSize: 11, color: INK.faint }}>ค่าจริง: {showCurrent}</div>
      )}
    </div>
  );
}

export function ForecastDashboard() {
  const [specs, setSpecs] = useState<Record<string, SliderSpec>>({});
  const [modelMeta, setModelMeta] = useState<ModelsDashboard['meta']>([]);
  const [sliders, setSliders] = useState<Record<string, number>>({});
  const [newsSliders, setNewsSliders] = useState<Record<string, number>>({});
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Freeze baseline on page open: fetch /api/models once, keep it for the
  // whole session (decision from ticket 04 — the base must not move under
  // the user).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dash = await getModelsDashboard();
        if (cancelled) return;
        setModelMeta(dash.meta);
        // Seed slider defaults from the backend slider specs (first simulate
        // call also brings them; seed here to render immediately).
        const r = await simulateModels({});
        if (cancelled) return;
        setSpecs(r.slider_specs);
        setResult(r);
        const init: Record<string, number> = {};
        const initNews: Record<string, number> = {};
        for (const [k, s] of Object.entries(r.slider_specs)) init[k] = s.default;
        for (const m of NEWS_MODELS) initNews[m] = 0;
        setSliders(init);
        setNewsSliders(initNews);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fireSimulate = useCallback((s: Record<string, number>, n: Record<string, number>) => {
    setLoading(true);
    setError(null);
    const overrides: Record<string, number> = {};
    for (const [k, v] of Object.entries(s)) {
      const spec = specs[k];
      if (!spec) continue;
      const def = spec.default ?? 0;
      if (Math.abs(v - def) > 1e-9) overrides[k] = v;
    }
    for (const [m, v] of Object.entries(n)) {
      if (v > 0) overrides[`news-${m}`] = v;
    }
    simulateModels(overrides)
      .then((r) => { setResult(r); setSpecs(r.slider_specs); })
      .catch((e) => setError(e instanceof Error ? e.message : 'คำนวณไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [specs]);

  // Debounced slider change (decision: 250ms + spinner)
  const onSlider = useCallback((key: string, v: number) => {
    setSliders((prev) => {
      const next = { ...prev, [key]: v };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLoading(true);
      debounceRef.current = setTimeout(() => fireSimulate(next, newsSliders), DEBOUNCE_MS);
      return next;
    });
  }, [fireSimulate, newsSliders]);

  const onNewsSlider = useCallback((key: string, v: number) => {
    setNewsSliders((prev) => {
      const next = { ...prev, [key]: v };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLoading(true);
      debounceRef.current = setTimeout(() => fireSimulate(sliders, next), DEBOUNCE_MS);
      return next;
    });
  }, [fireSimulate, sliders]);

  const applyPreset = useCallback((values: Record<string, number>) => {
    setSliders((prev) => {
      const next = { ...prev };
      const newsNext = { ...newsSliders };
      for (const [k, v] of Object.entries(values)) {
        if (k.startsWith('news-')) newsNext[k.slice(5)] = v;
        else next[k] = v;
      }
      setNewsSliders(newsNext);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLoading(true);
      debounceRef.current = setTimeout(() => fireSimulate(next, newsNext), DEBOUNCE_MS);
      return next;
    });
  }, [fireSimulate, newsSliders]);

  const resetAll = useCallback(() => {
    setSliders((prev) => {
      const next: Record<string, number> = {};
      for (const k of Object.keys(prev)) next[k] = specs[k]?.default ?? 0;
      const nextNews: Record<string, number> = {};
      for (const m of NEWS_MODELS) nextNews[m] = 0;
      setNewsSliders(nextNews);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      fireSimulate(next, nextNews);
      return next;
    });
  }, [specs, fireSimulate]);

  const metaById = useMemo(() => {
    const m = new Map<string, ModelsDashboard['meta'][number]>();
    for (const x of modelMeta) m.set(x.model_id, x);
    return m;
  }, [modelMeta]);

  const baseByModel = useMemo(() => {
    if (!result) return new Map<string, SimulatedModel>();
    return new Map(result.baseline.map((m) => [m.model_id, m]));
  }, [result]);

  const signals = useMemo(() => {
    if (!result) return { newOnes: [] as SimulatedModel[], faded: [] as SimulatedModel[] };
    const newOnes = result.simulated.filter((m) => m.score >= 40 && (baseByModel.get(m.model_id)?.score ?? 0) < 40);
    const faded = result.simulated.filter((m) => m.score < 40 && (baseByModel.get(m.model_id)?.score ?? 0) >= 40);
    return { newOnes, faded };
  }, [result, baseByModel]);

  const sliderGroups = useMemo(() => {
    return SLIDER_GROUPS.map((g) => ({ ...g, items: g.keys.filter((k) => specs[k]) }));
  }, [specs]);

  if (error && !result) {
    return (
      <div style={{ padding: 24, color: INK.red, fontSize: 14 }}>
        ⚠️ {error}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: INK.ink }}>จำลองสถานการณ์</h1>
      <div style={{ color: INK.faint, fontSize: 13, marginTop: 4 }}>
        ปรับสถานการณ์สมมติ — จำลองผลกระทบต่อคะแนนโมเดลเมื่อตัวแปรสำคัญเปลี่ยน
      </div>

      {/* Simulation banner — simulated values must never be mistaken for real */}
      <div style={{
        marginTop: 14, background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.25)',
        borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#bae6fd',
      }}>
        ⚠️ ตัวเลขทั้งหมดในหน้านี้เป็นสถานการณ์สมมติ (what-if) ที่ผู้ใช้ตั้งค่าเอง — คะแนน สัญญาณ และผลกระทบไม่ใช่ข้อมูลจริงและไม่ใช่คำแนะนำการลงทุน
      </div>

      {result && result.missing_base.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: INK.amber, background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.3)', borderRadius: 8, padding: '8px 12px' }}>
          ⚠️ ไม่มีค่าฐานสดของ {result.missing_base.join(', ')} — ใช้ค่ากลางแทน — ความไวของผลจำลองส่วนนั้นเป็นค่าประมาณ
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16, marginTop: 16 }} className="forecast-grid">
        {/* Left: controls */}
        <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 12, padding: 16, alignSelf: 'start' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: INK.ink }}>⚙️ ปรับสถานการณ์สมมติ</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0 4px' }}>
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => applyPreset(p.values)} style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                background: 'rgba(56,189,248,.12)', border: '1px solid rgba(56,189,248,.35)', color: '#bae6fd',
              }}>{p.label}</button>
            ))}
          </div>

          {sliderGroups.map((g) => (
            <div key={g.title}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: INK.faint, margin: '12px 0 6px' }}>
                {g.title}
              </div>
              {g.items.map((k) => (
                <SliderRow key={k} spec={specs[k]} value={sliders[k] ?? specs[k]?.default ?? 0} onChange={(v) => onSlider(k, v)} />
              ))}
            </div>
          ))}

          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: INK.faint, margin: '12px 0 6px' }}>
            ข่าว (ของเราเพิ่มจากต้นฉบับ)
          </div>
          {NEWS_MODELS.map((m) => (
            <SliderRow
              key={m}
              spec={{ label_th: `ระดับข่าวแรง — ${MODEL_SHORT_TH[m] ?? m}`, min: 0, max: 100, step: 5, default: 0, unit: '' }}
              value={newsSliders[m] ?? 0}
              onChange={(v) => onNewsSlider(m, v)}
            />
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <button onClick={resetAll} style={{ fontSize: 13, color: INK.faint, background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
              ↺ รีเซ็ตค่าทั้งหมด
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: 11.5, color: INK.faint, borderTop: `1px solid ${INK.border}`, paddingTop: 10 }}>
            การจำลองเป็นค่าประมาณทิศทางจากตรรกะเดียวกับ scoring engine (แบบย่อ) — ไม่ใช่ผลการคำนวณเต็มรูปแบบ · ไม่ใช่คำแนะนำการลงทุน และไม่ใช่สัญญาณจริง
          </div>
        </div>

        {/* Right: results */}
        <div style={{ background: INK.panel, border: `1px solid ${INK.border}`, borderRadius: 12, padding: 16, position: 'relative' }}>
          {loading && (
            <div style={{
              position: 'fixed', top: 14, right: 20, background: INK.panel, border: `1px solid ${INK.accent}`,
              color: INK.accent, fontSize: 13, padding: '8px 14px', borderRadius: 999, zIndex: 9,
            }}>⏳ กำลังคำนวณ...</div>
          )}
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: INK.ink }}>🎯 ผลกระทบต่อคะแนนโมเดล</h2>
          {error && <div style={{ color: INK.red, fontSize: 13, marginBottom: 8 }}>⚠️ {error}</div>}

          {!result ? (
            <div style={{ color: INK.faint, fontSize: 13, padding: 20 }}>กำลังโหลด...</div>
          ) : (
            result.simulated.map((m, i) => {
              const base = baseByModel.get(m.model_id);
              const meta = metaById.get(m.model_id);
              const d = m.delta;
              const dCls = d > 0.5 ? INK.emerald : d < -0.5 ? INK.red : INK.faint;
              const stCls = m.status === 'active' ? INK.emerald : m.status === 'building' ? INK.amber : INK.faint;
              const barColor = d >= 0 ? INK.accent : INK.orange;
              const isSimulated = Math.abs(m.score - (base?.score ?? 0)) > 0.05;
              const activates = m.score >= 40 && (base?.score ?? 0) < 40;
              const deactivates = m.score < 40 && (base?.score ?? 0) >= 40;
              const isOpen = expanded.has(m.model_id);
              return (
                <div key={m.model_id} style={{
                  background: INK.panel2, border: `1px solid ${isSimulated ? 'rgba(251,191,36,.45)' : INK.border}`,
                  borderStyle: isSimulated ? 'dashed' : 'solid',
                  borderRadius: 10, padding: '12px 14px', marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: INK.faint, width: 26, textAlign: 'right' }}>#{i + 1}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, flex: 1, color: INK.ink }}>
                      {meta?.name_th ?? m.model_id}
                    </span>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600, color: stCls,
                      background: `${stCls}1f`,
                    }}>{STATUS_TH[m.status]}</span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
                      <span style={{ color: INK.faint }}>{(base?.score ?? 0).toFixed(1)}</span>
                      <span style={{ color: INK.faint }}>→</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: INK.ink }}>{m.score.toFixed(1)}</span>
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                      color: dCls, background: `${dCls}1f`,
                    }}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>
                  </div>
                  <div style={{ marginTop: 8, height: 12, background: INK.panel, borderRadius: 999, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(100,116,139,.35)', borderRadius: 999, width: `${Math.min(100, base?.score ?? 0)}%` }} />
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 999, opacity: 0.85, background: barColor, width: `${Math.min(100, m.score)}%` }} />
                  </div>
                  {activates && (
                    <div style={{ marginTop: 8, fontSize: 12, color: INK.accent }}>
                      ▲ ถ้าเกิดสถานการณ์นี้ โมเดลจะเริ่มพิจารณาสัญญาณเหล่านี้
                    </div>
                  )}
                  {deactivates && (
                    <div style={{ marginTop: 8, fontSize: 12, color: INK.orange }}>
                      ▼ ถ้าเกิดสถานการณ์นี้ โมเดลจะต่ำกว่าเกณฑ์ก่อตัวและหยุดพิจารณาสัญญาณใหม่
                    </div>
                  )}
                  <button
                    onClick={() => setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(m.model_id)) next.delete(m.model_id); else next.add(m.model_id);
                      return next;
                    })}
                    style={{ marginTop: 8, fontSize: 12, color: INK.faint, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    ▸ สินทรัพย์ที่เกี่ยวข้อง + factor
                  </button>
                  {isOpen && (
                    <div style={{ marginTop: 10, borderTop: `1px dashed ${INK.border}`, paddingTop: 10, fontSize: 12.5 }}>
                      <div style={{ color: INK.faint }}>
                        คะแนนปัจจุบัน {(base?.score ?? 0).toFixed(1)} → จำลอง {m.score.toFixed(1)} (Δ {d > 0 ? '+' : ''}{d.toFixed(1)}) · confidence: ข้อมูลจริง {m.confidence}%
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${INK.border}`, color: INK.faint, fontWeight: 500 }}>Factor</th>
                            <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${INK.border}`, color: INK.faint, fontWeight: 500 }}>ปัจจุบัน</th>
                            <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${INK.border}`, color: INK.faint, fontWeight: 500 }}>จำลอง</th>
                            <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${INK.border}`, color: INK.faint, fontWeight: 500 }}>Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(['macro', 'market_structure', 'news', 'confirmation', 'risk_penalty'] as const).map((f) => {
                            const b = base?.factors[f] ?? 0;
                            const s = m.factors[f];
                            return (
                              <tr key={f}>
                                <td style={{ padding: '4px 6px', borderBottom: `1px solid ${INK.border}` }}>{f}</td>
                                <td style={{ padding: '4px 6px', borderBottom: `1px solid ${INK.border}` }}>{b.toFixed(1)}</td>
                                <td style={{ padding: '4px 6px', borderBottom: `1px solid ${INK.border}` }}>{s.toFixed(1)}</td>
                                <td style={{ padding: '4px 6px', borderBottom: `1px solid ${INK.border}` }}>{(s - b).toFixed(1)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div style={{ color: INK.faint, marginTop: 8 }}>สินทรัพย์ที่เกี่ยวข้อง</div>
                      {meta?.signal_map?.map((s) => (
                        <div key={s.asset} style={{ padding: '3px 6px', borderBottom: `1px solid ${INK.border}`, fontSize: 12 }}>
                          {s.asset} · {s.direction}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {(signals.newOnes.length > 0 || signals.faded.length > 0) && (
            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: INK.accent, marginBottom: 8 }}>
                📡 ผลต่อสัญญาณเทรด (มีสิทธิ์เกิด — ยังต้องรอ TA ยืนยัน)
              </h3>
              <div>
                {signals.newOnes.map((m) => (
                  <span key={m.model_id} style={{
                    fontSize: 12, padding: '3px 9px', borderRadius: 6, marginRight: 6, marginBottom: 4, display: 'inline-block',
                    background: 'rgba(52,211,153,.12)', color: INK.emerald, border: '1px solid rgba(52,211,153,.3)',
                  }}>🟢 มีสิทธิ์เกิด — {MODEL_SHORT_TH[m.model_id] ?? m.model_id}</span>
                ))}
                {signals.faded.map((m) => (
                  <span key={m.model_id} style={{
                    fontSize: 12, padding: '3px 9px', borderRadius: 6, marginRight: 6, marginBottom: 4, display: 'inline-block',
                    background: 'rgba(248,113,113,.12)', color: INK.red, border: '1px solid rgba(248,113,113,.3)',
                  }}>🔴 อ่อนแรง/หาย — {MODEL_SHORT_TH[m.model_id] ?? m.model_id}</span>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: INK.faint, marginTop: 6 }}>
                * ยังต้องรอ TA ยืนยัน (ta_score ≥ 50) — สัญญาณจำลองไม่ถูกบันทึกลงประวัติ
              </div>
            </div>
          )}

          {result && (
            <div style={{ marginTop: 16, fontSize: 11, color: INK.faint }}>
              อัปเดตล่าสุด: {result.simulated_at}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) { .forecast-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
