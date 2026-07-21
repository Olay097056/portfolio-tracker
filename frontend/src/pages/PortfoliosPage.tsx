import { useState } from 'react';
import { AddPortfolioForm } from '../components/AddPortfolioForm';
import { PortfolioCard } from '../components/PortfolioCard';
import { PortfolioHoldings } from '../components/PortfolioHoldings';
import { usePortfolios } from '../hooks/usePortfolios';

export function PortfoliosPage() {
  const { portfolios, loading, error, create, remove } = usePortfolios();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  function toggleHoldings(id: number) {
    setExpandedId((current) => (current === id ? null : id));
  }

  if (loading) {
    return <div>Loading portfolios…</div>;
  }

  return (
    <div>
      <h2>Portfolios</h2>
      {error && <div role="alert">{error}</div>}
      <AddPortfolioForm onSubmit={create} />
      {portfolios.length === 0 ? (
        <p>No portfolios yet — add one above.</p>
      ) : (
        portfolios.map((portfolio) => (
          <div key={portfolio.id}>
            <PortfolioCard
              portfolio={portfolio}
              onDelete={remove}
              onToggleHoldings={toggleHoldings}
              expanded={expandedId === portfolio.id}
            />
            {expandedId === portfolio.id && <PortfolioHoldings portfolioId={portfolio.id} />}
          </div>
        ))
      )}
    </div>
  );
}
