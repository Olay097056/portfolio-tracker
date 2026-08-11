import { useCallback, useEffect, useState } from 'react';
import { getCmeZone } from '../../api/client';
import type { CmeZone, CmeGoldFlow, CmeFedWatch, CmeCryptoIv } from '../../api/types';

// CME zone — หน้า /cme ของ reference (โซน CME):
// FedWatch (โอกาสขึ้น/คง/ลง จากฟิวเจอร์ส ZQ) + กระแสเงินทอง (OI/วอลุ่ม) +
// crypto IV (Deribit) + COT — ส่วนที่ต้องใช้ vol2vol (paywall) แสดง "—"
// ตามที่ prototype วัด (docs/research/bond-crisis-cme-prototype-2026-08-11.md)
// ใช้ชุดสี "ink" ของต้นฉบับ — scope ภายใน component นี้เท่านั้น

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
};

const NUM_STYLE: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
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

function FedWatchCards({ fw }: { fw: CmeFedWatch | null }) {
  if (!fw) {
    return <Panel title="FedWatch — อัตราเฟดที่ตลาดคิด"><div style={{ color: INK.inkFaint }}>—</div></Panel>;
  }
  const cards = [
    { label: 'ดอกเบี้ยเฟดที่ตลาดคิด', value: `${fw.implied_rate.toFixed(2)}%`, note: `EFFR ${fw.effr.toFixed(2)}%` },
    { label: 'ส่วนต่าง', value: `${fw.diff_bp > 0 ? '+' : ''}${fw.diff_bp.toFixed(1)} bps`, note: 'เทียบ EFFR' },
    { label: `โอกาส${fw.outcome === 'hike' ? 'ขึ้น' : fw.outcome === 'cut' ? 'ลง' : 'คง'} ${fw.size}`, value: `${fw.outcome === 'hike' ? fw.prob_hike_pct : fw.outcome === 'cut' ? fw.prob_cut_pct : fw.prob_hold_pct}%`, note: 'ประชุมหน้า' },
    { label: 'ราคาฟิวเจอร์ส ZQ', value: fw.zq_price.toFixed(3), note: '30-day Fed Funds' },
  ];
  return (
    <Panel title="FedWatch — อัตราเฟดที่ตลาดคิด" right={
      <span style={{ fontSize: '0.68rem', color: INK.inkFaint }}>จาก ZQ=F · วิธีเดียวกับ CME FedWatch</span>
    }>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: '0.68rem', color: INK.inkFaint }}>{c.label}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: INK.ink, marginTop: 2, ...NUM_STYLE }}>{c.value}</div>
            <div style={{ fontSize: '0.66rem', color: INK.inkFaint }}>{c.note}</div>
          </div>
        ))}
      </div>
      {/* probability bar */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${fw.prob_hike_pct}%`, background: INK.emerald }} />
          <div style={{ width: `${fw.prob_hold_pct}%`, background: INK.amber }} />
          <div style={{ width: `${fw.prob_cut_pct}%`, background: INK.red }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: INK.inkDim, marginTop: 4 }}>
          <span>ขึ้น {fw.prob_hike_pct}%</span>
          <span>คง {fw.prob_hold_pct}%</span>
          <span>ลง {fw.prob_cut_pct}%</span>
        </div>
      </div>
    </Panel>
  );
}

function GoldFlow({ gf }: { gf: CmeGoldFlow | null }) {
  const rows = gf ? [
    { label: 'Open Interest ฟิวเจอร์ส', value: fmtInt(gf.future_oi) },
    { label: 'วอลุ่มฟิวเจอร์ส', value: fmtInt(gf.future_volume) },
    { label: 'Open Interest ออปชัน', value: fmtInt(gf.option_oi) },
    { label: 'วอลุ่มออปชัน', value: fmtInt(gf.option_volume) },
  ] : [];
  return (
    <Panel title="ทองคำ CME · โฟลว์ฟิวเจอร์ส" right={
      gf?.source ? <span style={{ fontSize: '0.66rem', color: INK.inkFaint }}>{gf.source}</span> : undefined
    }>
      {gf ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            {rows.map((r) => (
              <div key={r.label} style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: '0.68rem', color: INK.inkFaint }}>{r.label}</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: INK.ink, marginTop: 2, ...NUM_STYLE }}>{r.value}</div>
              </div>
            ))}
          </div>
          {gf.future_oi_change !== null && gf.future_oi_change !== undefined && (
            <div style={{ marginTop: 8, fontSize: '0.72rem', color: gf.future_oi_change >= 0 ? INK.emerald : INK.red }}>
              ΔOI สัปดาห์: {gf.future_oi_change > 0 ? '+' : ''}{fmtInt(gf.future_oi_change)}
            </div>
          )}
          {gf.trade_date && <div style={{ marginTop: 6, fontSize: '0.66rem', color: INK.inkFaint }}>ข้อมูล {gf.trade_date}</div>}
        </>
      ) : <div style={{ color: INK.inkFaint }}>—</div>}
    </Panel>
  );
}

function CryptoIv({ iv }: { iv: Record<string, CmeCryptoIv | null> }) {
  return (
    <Panel title="ความผันผวนคาดการณ์ (IV) — คริปโต">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
        {Object.entries(iv).map(([sym, d]) => (
          <div key={sym} style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: INK.inkDim }}>{sym}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: INK.accent, marginTop: 2, ...NUM_STYLE }}>
              {d?.iv !== null && d?.iv !== undefined ? `${d.iv.toFixed(1)}%` : '—'}
            </div>
            <div style={{ fontSize: '0.6rem', color: INK.inkFaint }}>{d ? 'Deribit ATM' : 'ไม่มีออปชัน'}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CotTable({ cot }: { cot: { series_id: string; name_th?: string; value?: number | null }[] }) {
  return (
    <Panel title="COT — สถานะตลาด (CFTC)" right={<span style={{ fontSize: '0.66rem', color: INK.inkFaint }}>รายสัปดาห์</span>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {cot.length === 0 && <div style={{ color: INK.inkFaint }}>—</div>}
        {cot.map((c) => (
          <div key={c.series_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
            <span style={{ color: INK.inkDim }}>{c.name_th || c.series_id}</span>
            <span style={{ color: INK.ink, fontWeight: 700, ...NUM_STYLE }}>{fmtInt(c.value as number)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function CmeDashboard() {
  const [data, setData] = useState<CmeZone | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getCmeZone();
      setData(d);
      setError(null);
    } catch {
      setError('โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ color: INK.inkDim, padding: 24 }}>กำลังโหลดโซน CME…</div>;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <FedWatchCards fw={data.fedwatch} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <GoldFlow gf={data.gold_flow} />
        <CryptoIv iv={data.crypto_iv} />
      </div>
      <CotTable cot={data.cot} />
      <div style={{ fontSize: '0.68rem', color: INK.inkFaint }}>
        อัปเดตล่าสุด: {data.updated_at} · แหล่ง: {data.data_sources.join(' · ')} · IV โลหะ/พลังงาน/บอนด์ (vol2vol paywall) แสดง "—"
      </div>
    </div>
  );
}
