import { AddHoldingForm } from './AddHoldingForm';
import { HoldingRow } from './HoldingRow';
import { useHoldings } from '../hooks/useHoldings';

interface PortfolioHoldingsProps {
  portfolioId: number;
}

export function PortfolioHoldings({ portfolioId }: PortfolioHoldingsProps) {
  const { holdings, loading, error, create, remove } = useHoldings(portfolioId);

  if (loading) {
    return <div>Loading holdings…</div>;
  }

  return (
    <div>
      {error && <div role="alert">{error}</div>}
      <AddHoldingForm onSubmit={create} />
      {holdings.length === 0 ? (
        <p>No holdings yet — add one above.</p>
      ) : (
        holdings.map((holding) => <HoldingRow key={holding.id} holding={holding} onDelete={remove} />)
      )}
    </div>
  );
}
