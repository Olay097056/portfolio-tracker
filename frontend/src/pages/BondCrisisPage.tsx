import { useState } from 'react';
import { BankingDashboard } from '../components/tools/BankingDashboard';
import { CountriesDashboard } from '../components/tools/CountriesDashboard';
import { ForecastDashboard } from '../components/tools/ForecastDashboard';
import { MacroDashboard } from '../components/tools/MacroDashboard';
import { ModelsDashboard } from '../components/tools/ModelsDashboard';
import { SignalsDashboard } from '../components/tools/SignalsDashboard';
import { NewsDashboard } from '../components/tools/NewsDashboard';

// Bond-crisis — main tab that hosts the macro dashboard (yield curve, money
// market rates, credit spreads, macro assets), the profit models page
// (six regime models scored 0-100), the trading signals trade desk, the
// banking stress monitor, the country-risk overview, the scenario simulator
// and the news feed. Seven sub-tabs mirroring the reference site's ข้อมูล
// มหภาค (/macro), โมเดลทำกำไร (/models), สัญญาณเทรด (/signals), วิกฤตแบงก์รัน
// (/banking), รายประเทศ (/countries), จำลองสถานการณ์ (/forecast) and
// ข่าวสาร (/news) pages.
export function BondCrisisPage() {
  const [tab, setTab] = useState<'macro' | 'models' | 'signals' | 'banking' | 'countries' | 'forecast' | 'news'>('macro');

  const tabs = [
    { id: 'macro' as const, label: 'ข้อมูลมหภาค' },
    { id: 'models' as const, label: 'โมเดลทำกำไร' },
    { id: 'signals' as const, label: 'สัญญาณเทรด' },
    { id: 'banking' as const, label: 'วิกฤตแบงก์รัน' },
    { id: 'countries' as const, label: 'รายประเทศ' },
    { id: 'forecast' as const, label: 'จำลองสถานการณ์' },
    { id: 'news' as const, label: 'ข่าวสาร' },
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
            ศูนย์ติดตามวิกฤตพันธบัตรและความเสี่ยงมหภาค — Yield Curve, ตลาดเงิน, เครดิตสเปรด, โมเดลทำกำไร และข่าวสาร (FRED + Yahoo Finance + CFTC + TIC + RSS)
          </span>
        </div>
      </div>

      {/* ── Sub-tabs (ข้อมูลมหภาค / โมเดลทำกำไร / สัญญาณเทรด / ข่าวสาร) ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10, flexWrap: 'wrap' }}>
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

      {tab === 'macro' ? (
        <MacroDashboard />
      ) : tab === 'models' ? (
        <ModelsDashboard />
      ) : tab === 'signals' ? (
        <SignalsDashboard />
      ) : tab === 'banking' ? (
        <BankingDashboard />
      ) : tab === 'countries' ? (
        <CountriesDashboard />
      ) : tab === 'forecast' ? (
        <ForecastDashboard />
      ) : (
        <NewsDashboard />
      )}
    </div>
  );
}
