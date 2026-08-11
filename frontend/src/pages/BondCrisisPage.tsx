import { useState } from 'react';
import { BankingDashboard } from '../components/tools/BankingDashboard';
import { BoardroomDashboard } from '../components/tools/BoardroomDashboard';
import { BoardroomSignalsDashboard } from '../components/tools/BoardroomSignalsDashboard';
import { CmeDashboard } from '../components/tools/CmeDashboard';
import { SentimentDashboard } from '../components/tools/SentimentDashboard';
import { LearnDashboard } from '../components/tools/LearnDashboard';
import { SettingsDashboard } from '../components/tools/SettingsDashboard';
import { CountriesDashboard } from '../components/tools/CountriesDashboard';
import { ForecastDashboard } from '../components/tools/ForecastDashboard';
import { MacroDashboard } from '../components/tools/MacroDashboard';
import { ModelsDashboard } from '../components/tools/ModelsDashboard';
import { OverviewDashboard } from '../components/tools/OverviewDashboard';
import { SignalsDashboard } from '../components/tools/SignalsDashboard';
import { NewsDashboard } from '../components/tools/NewsDashboard';

// Bond-crisis — main tab that hosts the macro dashboard (yield curve, money
// market rates, credit spreads, macro assets), the profit models page
// (six regime models scored 0-100), the trading signals trade desk, the
// banking stress monitor, the country-risk overview, the scenario simulator,
// the AI boardroom and the news feed. Eight sub-tabs mirroring the reference
// site's ข้อมูลมหภาค (/macro), โมเดลทำกำไร (/models), สัญญาณเทรด (/signals),
// วิกฤตแบงก์รัน (/banking), รายประเทศ (/countries), จำลองสถานการณ์ (/forecast),
// ห้องประชุม (/boardroom) and ข่าวสาร (/news) pages.
export function BondCrisisPage() {
  const [tab, setTab] = useState<'overview' | 'macro' | 'models' | 'signals' | 'sentiment' | 'cme' | 'banking' | 'countries' | 'forecast' | 'boardroom' | 'boardroom-signals' | 'news' | 'learn' | 'settings'>('overview');
  const [signalsFocusMeeting, setSignalsFocusMeeting] = useState<string | null>(null);

  const goMeetingFromSignals = (meetingId: string) => {
    setSignalsFocusMeeting(meetingId);
    setTab('boardroom');
  };

  const tabs = [
    { id: 'overview' as const, label: 'ภาพรวม' },
    { id: 'macro' as const, label: 'ข้อมูลมหภาค' },
    { id: 'models' as const, label: 'โมเดลทำกำไร' },
    { id: 'signals' as const, label: 'สัญญาณเทรด' },
    { id: 'sentiment' as const, label: 'อารมณ์ตลาด' },
    { id: 'cme' as const, label: 'โซน CME' },
    { id: 'banking' as const, label: 'วิกฤตแบงก์รัน' },
    { id: 'countries' as const, label: 'รายประเทศ' },
    { id: 'forecast' as const, label: 'จำลองสถานการณ์' },
    { id: 'boardroom' as const, label: 'ห้องประชุม' },
    { id: 'boardroom-signals' as const, label: 'สัญญาณที่ประชุม' },
    { id: 'news' as const, label: 'ข่าวสาร' },
    { id: 'learn' as const, label: 'บทเรียน' },
    { id: 'settings' as const, label: 'ตั้งค่า' },
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

      {tab === 'overview' ? (
        <OverviewDashboard />
      ) : tab === 'macro' ? (
        <MacroDashboard />
      ) : tab === 'models' ? (
        <ModelsDashboard />
      ) : tab === 'signals' ? (
        <SignalsDashboard />
      ) : tab === 'sentiment' ? (
        <SentimentDashboard />
      ) : tab === 'cme' ? (
        <CmeDashboard />
      ) : tab === 'banking' ? (
        <BankingDashboard />
      ) : tab === 'countries' ? (
        <CountriesDashboard />
      ) : tab === 'forecast' ? (
        <ForecastDashboard />
      ) : tab === 'boardroom' ? (
        <BoardroomDashboard focusMeetingId={signalsFocusMeeting} />
      ) : tab === 'boardroom-signals' ? (
        <BoardroomSignalsDashboard onGoMeeting={goMeetingFromSignals} />
      ) : tab === 'learn' ? (
        <LearnDashboard />
      ) : tab === 'settings' ? (
        <SettingsDashboard />
      ) : (
        <NewsDashboard />
      )}
    </div>
  );
}