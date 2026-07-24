import { useState } from 'react';
import { DcaProjectionCalculator } from '../components/DcaProjectionCalculator';
import { EtfComparisonTool } from '../components/EtfComparisonTool';
import { PassiveIncomeCalculator } from '../components/PassiveIncomeCalculator';
import { PortfolioBuilderWizard } from '../components/PortfolioBuilderWizard';

type ToolsTab = 'dca-projection' | 'passive-income' | 'portfolio-builder' | 'etf-comparison';

export function ToolsPage() {
  const [activeTab, setActiveTab] = useState<ToolsTab>('dca-projection');

  return (
    <div>
      <h2>Tools</h2>
      <nav>
        <button
          type="button"
          aria-pressed={activeTab === 'dca-projection'}
          onClick={() => setActiveTab('dca-projection')}
        >
          DCA Projection
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'passive-income'}
          onClick={() => setActiveTab('passive-income')}
        >
          Passive Income
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'portfolio-builder'}
          onClick={() => setActiveTab('portfolio-builder')}
        >
          Portfolio Builder
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'etf-comparison'}
          onClick={() => setActiveTab('etf-comparison')}
        >
          ETF Comparison
        </button>
      </nav>
      {activeTab === 'dca-projection' && <DcaProjectionCalculator />}
      {activeTab === 'passive-income' && <PassiveIncomeCalculator />}
      {activeTab === 'portfolio-builder' && <PortfolioBuilderWizard />}
      {activeTab === 'etf-comparison' && <EtfComparisonTool />}
    </div>
  );
}
