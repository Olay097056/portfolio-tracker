import { useState } from 'react';
import { MacroDashboard } from '../components/tools/MacroDashboard';
import { ModelsDashboard } from '../components/tools/ModelsDashboard';

// Bond-crisis — main tab that hosts the macro dashboard (yield curve, money
// market rates, credit spreads, macro assets) and the profit models page
// (six regime models scored 0-100). Two sub-tabs mirroring the reference
// site's ข้อมูลมหภาค (/macro) and โมเดลทำกำไร (/models) pages.
export function BondCrisisPage() {
  const [tab, setTab] = useState<'macro' | 'models'>('macro');

  const tabs = [
    { id: 'macro' as const, label: 'ข้อมูลมหภาค' },
    { id: 'models' as const, label: 'โมเดลทำกำไร' },
  ];

  return (
    <div>
      {/* ── Page Header (app style, consistent with the other main tabs) ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>📉 Bond-crisis</h2>
            <span className="badge badge-red" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
              MACRO WATCH
            </span>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            ศูนย์ติดตามวิกฤตพันธบัตรและความเสี่ยงมหภาค — Yield Curve, ตลาดเงิน, เครดิตสเปรด และโมเดลทำกำไร (FRED + Yahoo Finance + CFTC + TIC)
          </span>
        </div>
      </div>

      {/* ── Sub-tabs (ข้อมูลมหภาค / โมเดลทำกำไร) ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: tab === t.id ? 'var(--primary)' : 'var(--card-bg)',
              color: tab === t.id ? '#fff' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'macro' ? <MacroDashboard /> : <ModelsDashboard />}
    </div>
  );
}
