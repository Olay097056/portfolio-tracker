import { useState, useEffect } from 'react';
import { DcaProjectionCalculator } from '../components/tools/DcaProjectionCalculator';
import { PassiveIncomeCalculator } from '../components/tools/PassiveIncomeCalculator';
import { PortfolioBuilderWizard } from '../components/tools/PortfolioBuilderWizard';
import { StockScreener } from '../components/tools/StockScreener';
import { InvestorTracker } from '../components/tools/InvestorTracker';
import { StockComparison } from '../components/tools/StockComparison';
import { FearGreedIndex } from '../components/tools/FearGreedIndex';
import { TabStrip } from '../components/TabStrip';
import { getUsdToThbRate } from '../api/client';

type ToolsTab =
  | 'dca-projection'
  | 'passive-income'
  | 'portfolio-builder'
  | 'stock-screener'
  | 'investor-tracker'
  | 'stock-comparison'
  | 'fear-greed';

const TABS = [
  { id: 'dca-projection', label: '🧮 DCA Projection' },
  { id: 'passive-income', label: '💰 Passive Income' },
  { id: 'portfolio-builder', label: '🏗️ Portfolio Builder' },
  { id: 'stock-screener', label: '📡 Stock Screener' },
  { id: 'investor-tracker', label: '🕵️‍♂️ Investor Tracker' },
  { id: 'stock-comparison', label: '⚖️ Stock Comparison' },
  { id: 'fear-greed', label: '😱 Fear & Greed' },
] as const satisfies { id: ToolsTab; label: string }[];

const FEATURE_CARDS = [
  {
    id: 'dca-projection' as const,
    title: 'DCA Projection',
    badge: '✨ RECOMMENDED',
    icon: '🧮',
    gradient: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(3, 105, 161, 0.25) 100%)',
    border: 'rgba(56, 189, 248, 0.35)',
    color: '#38bdf8',
    description: 'คำนวณการเติบโตพอร์ตออมหุ้นทบต้นระยะยาว 1–30 ปี พร้อมจำลองผลตอบแทนปันผลทบต้น',
  },
  {
    id: 'passive-income' as const,
    title: 'Passive Income',
    badge: '💰 FREEDOM',
    icon: '💎',
    gradient: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(180, 83, 9, 0.25) 100%)',
    border: 'rgba(251, 191, 36, 0.35)',
    color: '#fcd34d',
    description: 'วางแผนเป้าหมายรายได้ปันผลต่อเดือน คำนวณขนาดพอร์ตที่ต้องมีและระยะเวลาสู่อิสรภาพทางการเงิน',
  },
  {
    id: 'portfolio-builder' as const,
    title: 'Portfolio Builder',
    badge: '🏗️ AUTOMATED',
    icon: '🚀',
    gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(67, 56, 202, 0.25) 100%)',
    border: 'rgba(99, 102, 241, 0.35)',
    color: '#818cf8',
    description: 'สร้างพอร์ตลงทุนอัตโนมัติตามเป้าหมายความเสี่ยง (Aggressive Growth, Dividend, Conservative)',
  },
  {
    id: 'stock-screener' as const,
    title: 'Stock Screener',
    badge: '📡 SCREENER',
    icon: '🔍',
    gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.25) 100%)',
    border: 'rgba(245, 158, 11, 0.35)',
    color: '#f59e0b',
    description: 'สแกนและคัดกรองหุ้นอเมริกาด้วยดัชนีทางเทคนิคและงบการเงิน (konbalongtun style)',
  },
  {
    id: 'investor-tracker' as const,
    title: 'Investor Tracker',
    badge: '🕵️‍♂️ SUPER INVESTORS',
    icon: '🏛️',
    gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.25) 100%)',
    border: 'rgba(16, 185, 129, 0.35)',
    color: '#10b981',
    description: 'ติดตามพอร์ตเซียนหุ้นระดับโลก (Buffett, Cathie, Dalio, Gates, Burry) และรายงาน 13F Filings',
  },
  {
    id: 'stock-comparison' as const,
    title: 'Stock Comparison',
    badge: '⚖️ SIDE-BY-SIDE',
    icon: '⚖️',
    gradient: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(126, 34, 206, 0.25) 100%)',
    border: 'rgba(168, 85, 247, 0.35)',
    color: '#c084fc',
    description: 'เทียบหุ้นสูงสุด 4 ตัวแบบเคียงข้างกัน ทั้งมูลค่า ผลตอบแทน การเติบโต งบการเงิน และเทคนิค',
  },
  {
    id: 'fear-greed' as const,
    title: 'Fear & Greed',
    badge: '😱 MARKET MOOD',
    icon: '🌡️',
    gradient: 'linear-gradient(135deg, rgba(244, 63, 94, 0.15) 0%, rgba(190, 18, 60, 0.25) 100%)',
    border: 'rgba(244, 63, 94, 0.35)',
    color: '#fb7185',
    description: 'วัดอารมณ์ตลาดหุ้นอเมริกา 0–100 พร้อมตัวชี้วัดย่อย 7 ตัว และย้อนหลัง 1 ปี (CNN)',
  },
];

export function ToolsPage() {
  const [activeTab, setActiveTab] = useState<ToolsTab>('dca-projection');
  const [currency, setCurrency] = useState<'USD' | 'THB'>('USD');
  const [fxRate, setFxRate] = useState<number>(33.38);

  useEffect(() => {
    getUsdToThbRate()
      .then((rate) => {
        if (rate) setFxRate(rate);
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── Page Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          paddingBottom: '8px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'Outfit, sans-serif' }}>
            Tools
          </h2>
          <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            เครื่องมือวิเคราะห์การลงทุน ปรับแต่งพอร์ต และสแกนโมเมนตัมหุ้นอเมริกา (wethaiinvest style)
          </span>
        </div>

        {/* Currency Switcher Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'inline-flex',
              background: 'rgba(15,23,42,0.85)',
              padding: '3px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              onClick={() => setCurrency('USD')}
              style={{
                padding: '6px 16px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                border: 'none',
                background: currency === 'USD' ? 'var(--primary)' : 'transparent',
                color: currency === 'USD' ? '#fff' : 'var(--text-muted)',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              USD ($)
            </button>
            <button
              type="button"
              onClick={() => setCurrency('THB')}
              style={{
                padding: '6px 16px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                border: 'none',
                background: currency === 'THB' ? '#fcd34d' : 'transparent',
                color: currency === 'THB' ? '#090d16' : 'var(--text-muted)',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              THB (฿)
            </button>
          </div>
          <span className="badge badge-blue" style={{ fontSize: '0.78rem', padding: '6px 12px' }}>
            1 USD = {fxRate.toFixed(2)} THB
          </span>
        </div>
      </div>

      {/* ── Feature Hero Cards Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        {FEATURE_CARDS.map((card) => {
          const isActive = activeTab === card.id;
          return (
            <div
              key={card.id}
              onClick={() => setActiveTab(card.id)}
              style={{
                padding: '18px 20px',
                borderRadius: '14px',
                background: isActive ? card.gradient : 'rgba(17,24,39,0.6)',
                border: `1px solid ${isActive ? card.border : 'rgba(255,255,255,0.07)'}`,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isActive ? `0 8px 24px -6px ${card.color}33` : 'none',
                transform: isActive ? 'translateY(-2px)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = card.border;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
                  e.currentTarget.style.transform = 'none';
                }
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '1.5rem' }}>{card.icon}</span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    padding: '2px 8px',
                    borderRadius: '20px',
                    background: isActive ? `${card.color}25` : 'rgba(255,255,255,0.05)',
                    color: isActive ? card.color : 'var(--text-muted)',
                    border: `1px solid ${isActive ? card.border : 'rgba(255,255,255,0.1)'}`,
                  }}
                >
                  {card.badge}
                </span>
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 700, color: isActive ? '#ffffff' : '#e2e8f0', fontFamily: 'Outfit, sans-serif' }}>
                {card.title}
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.45' }}>
                {card.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Navigation Tab Strip ── */}
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Workspace Container ── */}
      <div style={{ minHeight: '400px' }}>
        {activeTab === 'dca-projection' && <DcaProjectionCalculator currency={currency} fxRate={fxRate} />}
        {activeTab === 'passive-income' && <PassiveIncomeCalculator currency={currency} fxRate={fxRate} />}
        {activeTab === 'portfolio-builder' && <PortfolioBuilderWizard />}
        {activeTab === 'stock-screener' && <StockScreener currency={currency} fxRate={fxRate} />}
        {activeTab === 'investor-tracker' && <InvestorTracker currency={currency} fxRate={fxRate} />}
        {activeTab === 'stock-comparison' && <StockComparison />}
        {activeTab === 'fear-greed' && <FearGreedIndex />}
      </div>
    </div>
  );
}
