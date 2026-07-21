import { AddPortfolioForm } from '../components/AddPortfolioForm';
import { PortfolioCard } from '../components/PortfolioCard';
import { usePortfolios } from '../hooks/usePortfolios';

export function PortfoliosPage() {
  const { portfolios, loading, error, create, remove } = usePortfolios();

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
          <PortfolioCard key={portfolio.id} portfolio={portfolio} onDelete={remove} />
        ))
      )}
    </div>
  );
}
