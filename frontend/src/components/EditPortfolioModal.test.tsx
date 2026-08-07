// frontend/src/components/EditPortfolioModal.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditPortfolioModal } from './EditPortfolioModal';
import type { Portfolio } from '../api/types';

function makePortfolio(overrides: Partial<Portfolio>): Portfolio {
  return {
    id: 1,
    name: 'DIME',
    cash_usd: 0,
    target_allocation_pct: 70,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('EditPortfolioModal', () => {
  it('pre-fills name and target allocation from the portfolio', () => {
    const portfolio = makePortfolio({ name: 'DIME', target_allocation_pct: 70 });
    render(
      <EditPortfolioModal portfolio={portfolio} allPortfolios={[portfolio]} onSave={vi.fn()} onRebalance={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByLabelText('Name')).toHaveValue('DIME');
    expect(screen.getByLabelText('Target allocation (%)')).toHaveValue(70);
  });

  it('blocks save with an empty name and does not call onSave', async () => {
    const portfolio = makePortfolio({});
    const onSave = vi.fn();
    render(
      <EditPortfolioModal portfolio={portfolio} allPortfolios={[portfolio]} onSave={onSave} onRebalance={vi.fn()} onClose={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Name is required');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancel closes without calling onSave or onRebalance', () => {
    const portfolio = makePortfolio({});
    const onSave = vi.fn();
    const onRebalance = vi.fn();
    const onClose = vi.fn();
    render(
      <EditPortfolioModal portfolio={portfolio} allPortfolios={[portfolio]} onSave={onSave} onRebalance={onRebalance} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onRebalance).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('saving with the rebalance section collapsed calls onSave (single-portfolio PATCH), not onRebalance', async () => {
    const portfolio = makePortfolio({ name: 'DIME', target_allocation_pct: 70 });
    const other = makePortfolio({ id: 2, name: 'Speculative', target_allocation_pct: 30 });
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onRebalance = vi.fn().mockResolvedValue(undefined);
    render(
      <EditPortfolioModal portfolio={portfolio} allPortfolios={[portfolio, other]} onSave={onSave} onRebalance={onRebalance} onClose={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'DIME Core' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'DIME Core' }));
    expect(onRebalance).not.toHaveBeenCalled();
  });

  it('expanding the rebalance section shows every other portfolio with a running total', () => {
    const portfolio = makePortfolio({ target_allocation_pct: 70 });
    const other = makePortfolio({ id: 2, name: 'Speculative', target_allocation_pct: 30 });
    render(
      <EditPortfolioModal portfolio={portfolio} allPortfolios={[portfolio, other]} onSave={vi.fn()} onRebalance={vi.fn()} onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit other portfolios' allocation/ }));

    expect(screen.getByLabelText('Speculative')).toHaveValue(30);
    expect(screen.getByRole('status')).toHaveTextContent('Total: 100.00%');
  });

  it('running total turns invalid when it no longer sums to 100 and blocks save', async () => {
    const portfolio = makePortfolio({ target_allocation_pct: 70 });
    const other = makePortfolio({ id: 2, name: 'Speculative', target_allocation_pct: 30 });
    const onRebalance = vi.fn();
    render(
      <EditPortfolioModal portfolio={portfolio} allPortfolios={[portfolio, other]} onSave={vi.fn()} onRebalance={onRebalance} onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit other portfolios' allocation/ }));
    fireEvent.change(screen.getByLabelText('Speculative'), { target: { value: '20' } });

    expect(screen.getByRole('status')).toHaveTextContent('Total: 90.00%');

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('100');
    expect(onRebalance).not.toHaveBeenCalled();
  });

  it('saving with the rebalance section expanded and summing to 100 calls onRebalance with every portfolio', async () => {
    const portfolio = makePortfolio({ id: 1, name: 'DIME', target_allocation_pct: 70 });
    const other = makePortfolio({ id: 2, name: 'Speculative', target_allocation_pct: 30 });
    const onRebalance = vi.fn().mockResolvedValue(undefined);
    render(
      <EditPortfolioModal portfolio={portfolio} allPortfolios={[portfolio, other]} onSave={vi.fn()} onRebalance={onRebalance} onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit other portfolios' allocation/ }));
    fireEvent.change(screen.getByLabelText('Target allocation (%)'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Speculative'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() =>
      expect(onRebalance).toHaveBeenCalledWith([
        { id: 1, target_allocation_pct: 60 },
        { id: 2, target_allocation_pct: 40 },
      ]),
    );
  });
});
