// frontend/src/components/PortfolioHoldings.tsx
import { AddHoldingForm } from './AddHoldingForm';
import { HoldingRow } from './HoldingRow';
import { useHoldings } from '../hooks/useHoldings';
import { usePortfolioSummary } from '../hooks/usePortfolioSummary';

interface PortfolioHoldingsProps {
  portfolioId: number;
  currencyMultiplier?: number;
  currencySymbol?: string;
}

export function PortfolioHoldings({
  portfolioId,
  currencyMultiplier = 1,
  currencySymbol = '$',
}: PortfolioHoldingsProps) {
  const { holdings, loading, error, create, remove } = useHoldings(portfolioId);
  const { summary, error: summaryError } = usePortfolioSummary(portfolioId);

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', padding: '8px 0' }}>Loading holdings…</div>;
  }

  return (
    <div>
      {error && <div role="alert" style={{ marginBottom: '8px' }}>{error}</div>}
      {summaryError && <div role="alert" style={{ marginBottom: '8px' }}>{summaryError}</div>}

      <div style={{ background: 'rgba(10, 14, 25, 0.6)', padding: '12px 16px', borderRadius: 8, marginBottom: '16px', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--primary)', marginBottom: '8px' }}>➕ เพิ่มหุ้นเข้าพอร์ต (Add Stock Holding)</div>
        <AddHoldingForm onSubmit={create} />
      </div>

      {holdings.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: '8px 0' }}>No holdings yet — add one above.</p>
      ) : (
        holdings.map((holding) => (
          <HoldingRow
            key={holding.id}
            holding={holding}
            onDelete={remove}
            stats={summary?.holdings.find((h) => h.ticker === holding.ticker)}
            currencyMultiplier={currencyMultiplier}
            currencySymbol={currencySymbol}
          />
        ))
      )}
    </div>
  );
}
