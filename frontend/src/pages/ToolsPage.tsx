import { useState } from 'react';
import { TabStrip } from '../components/TabStrip';
import { DcaProjectionCalculator } from '../components/DcaProjectionCalculator';
import { EtfComparisonTool } from '../components/EtfComparisonTool';
import { PassiveIncomeCalculator } from '../components/PassiveIncomeCalculator';
import { PortfolioBuilderWizard } from '../components/PortfolioBuilderWizard';

type ToolsTab = 'dca-projection' | 'passive-income' | 'portfolio-builder' | 'etf-comparison';

const TABS = [
  { id: 'dca-projection', label: 'DCA Projection' },
  { id: 'passive-income', label: 'Passive Income' },
  { id: 'portfolio-builder', label: 'Portfolio Builder' },
  { id: 'etf-comparison', label: 'ETF Comparison' },
] as const satisfies { id: ToolsTab; label: string }[];

export function ToolsPage() {
  const [activeTab, setActiveTab] = useState<ToolsTab>('dca-projection');

  return (
    <div>
      <h2>Tools</h2>
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'dca-projection' && <DcaProjectionCalculator />}
      {activeTab === 'passive-income' && <PassiveIncomeCalculator />}
      {activeTab === 'portfolio-builder' && <PortfolioBuilderWizard />}
      {activeTab === 'etf-comparison' && <EtfComparisonTool />}
    </div>
  );
}
