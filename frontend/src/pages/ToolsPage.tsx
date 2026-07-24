import { useState } from 'react';
import { DcaProjectionCalculator } from '../components/DcaProjectionCalculator';
import { PassiveIncomeCalculator } from '../components/PassiveIncomeCalculator';

type ToolsTab = 'dca-projection' | 'passive-income';

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
      </nav>
      {activeTab === 'dca-projection' && <DcaProjectionCalculator />}
      {activeTab === 'passive-income' && <PassiveIncomeCalculator />}
    </div>
  );
}
