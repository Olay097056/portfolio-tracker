import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { PortfolioBuilderWizard } from './PortfolioBuilderWizard';

describe('PortfolioBuilderWizard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('previews an allocation and creates a portfolio with one holding per resulting ticker', async () => {
    vi.spyOn(client, 'getUsdToThbRate').mockResolvedValue(35);
    vi.spyOn(client, 'getPrices').mockResolvedValue({ QQQ: 450, VUG: 300, VTI: 200, SPY: 150, BND: 90 });
    vi.spyOn(client, 'createPortfolio').mockResolvedValue({
      id: 1,
      name: 'Test Portfolio',
      cash_usd: 0,
      target_allocation_pct: null,
      created_at: '2026-01-01T00:00:00Z',
    });
    vi.spyOn(client, 'createHolding').mockResolvedValue({
      id: 1,
      portfolio_id: 1,
      ticker: 'QQQ',
      shares: 2,
      avg_cost_usd: 450,
      target_allocation_pct: null,
      realized_pnl_usd: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    render(<PortfolioBuilderWizard />);

    fireEvent.change(screen.getByLabelText(/portfolio name/i), { target: { value: 'Test Portfolio' } });
    fireEvent.change(screen.getByLabelText('Capital (THB)'), { target: { value: '105000' } });
    fireEvent.click(screen.getByRole('button', { name: /preview allocation/i }));

    await waitFor(() => expect(screen.getByText(/2.0000 shares/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /create portfolio/i }));

    await waitFor(() => expect(client.createPortfolio).toHaveBeenCalledWith({ name: 'Test Portfolio' }));
    expect(client.createHolding).toHaveBeenCalledTimes(4);
    expect(client.createHolding).toHaveBeenCalledWith(1, { ticker: 'QQQ', shares: 2, avg_cost_usd: 450 });
    expect(client.createHolding).toHaveBeenCalledWith(1, { ticker: 'VUG', shares: 3, avg_cost_usd: 300 });
  });

  it('wraps its content in a card', () => {
    const { container } = render(<PortfolioBuilderWizard />);

    expect(container.querySelector('.card')).not.toBeNull();
  });

  it('zebra-stripes the allocation-preview table and styles Create portfolio as a positive action', async () => {
    vi.spyOn(client, 'getUsdToThbRate').mockResolvedValue(35);
    vi.spyOn(client, 'getPrices').mockResolvedValue({ QQQ: 450, VUG: 300, VTI: 200, SPY: 150 });

    const { container } = render(<PortfolioBuilderWizard />);

    fireEvent.change(screen.getByLabelText(/portfolio name/i), { target: { value: 'Test Portfolio' } });
    fireEvent.change(screen.getByLabelText('Capital (THB)'), { target: { value: '105000' } });
    fireEvent.click(screen.getByRole('button', { name: /preview allocation/i }));

    await waitFor(() => expect(screen.getByText(/2.0000 shares/)).toBeInTheDocument());

    expect(container.querySelector('table.zebra-table')).not.toBeNull();
    expect(screen.getByRole('button', { name: /create portfolio/i })).toHaveStyle({ color: 'var(--primary)' });
  });

  it('clears the preview after a failed create so a blind retry cannot create a duplicate portfolio', async () => {
    vi.spyOn(client, 'getUsdToThbRate').mockResolvedValue(35);
    vi.spyOn(client, 'getPrices').mockResolvedValue({ QQQ: 450, VUG: 300, VTI: 200, SPY: 150 });
    vi.spyOn(client, 'createPortfolio').mockResolvedValue({
      id: 1,
      name: 'Test Portfolio',
      cash_usd: 0,
      target_allocation_pct: null,
      created_at: '2026-01-01T00:00:00Z',
    });
    vi.spyOn(client, 'createHolding').mockRejectedValue(new Error('holding create failed'));
    vi.spyOn(client, 'deletePortfolio').mockResolvedValue(undefined);

    render(<PortfolioBuilderWizard />);

    fireEvent.change(screen.getByLabelText(/portfolio name/i), { target: { value: 'Test Portfolio' } });
    fireEvent.change(screen.getByLabelText('Capital (THB)'), { target: { value: '105000' } });
    fireEvent.click(screen.getByRole('button', { name: /preview allocation/i }));

    await waitFor(() => expect(screen.getByText(/2.0000 shares/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /create portfolio/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/holding create failed/i), { timeout: 5000 });
    expect(screen.queryByRole('button', { name: /create portfolio/i })).not.toBeInTheDocument();
  });

  it('rolls back the partially created portfolio when a holding fails to create', async () => {
    vi.spyOn(client, 'getUsdToThbRate').mockResolvedValue(35);
    vi.spyOn(client, 'getPrices').mockResolvedValue({ QQQ: 450, VUG: 300, VTI: 200, SPY: 150 });
    vi.spyOn(client, 'createPortfolio').mockResolvedValue({
      id: 1,
      name: 'Test Portfolio',
      cash_usd: 0,
      target_allocation_pct: null,
      created_at: '2026-01-01T00:00:00Z',
    });
    vi.spyOn(client, 'createHolding').mockRejectedValue(new Error('holding create failed'));
    const deletePortfolioSpy = vi.spyOn(client, 'deletePortfolio').mockResolvedValue(undefined);

    render(<PortfolioBuilderWizard />);

    fireEvent.change(screen.getByLabelText(/portfolio name/i), { target: { value: 'Test Portfolio' } });
    fireEvent.change(screen.getByLabelText('Capital (THB)'), { target: { value: '105000' } });
    fireEvent.click(screen.getByRole('button', { name: /preview allocation/i }));

    await waitFor(() => expect(screen.getByText(/2.0000 shares/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /create portfolio/i }));

    await waitFor(() => expect(deletePortfolioSpy).toHaveBeenCalledWith(1));
    expect(screen.getByRole('alert')).toHaveTextContent(/holding create failed/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/removed|rolled back/i);
    expect(screen.queryByRole('button', { name: /create portfolio/i })).not.toBeInTheDocument();
  });

  it('tells the user to clean up manually when the rollback itself also fails', async () => {
    vi.spyOn(client, 'getUsdToThbRate').mockResolvedValue(35);
    vi.spyOn(client, 'getPrices').mockResolvedValue({ QQQ: 450, VUG: 300, VTI: 200, SPY: 150 });
    vi.spyOn(client, 'createPortfolio').mockResolvedValue({
      id: 1,
      name: 'Test Portfolio',
      cash_usd: 0,
      target_allocation_pct: null,
      created_at: '2026-01-01T00:00:00Z',
    });
    vi.spyOn(client, 'createHolding').mockRejectedValue(new Error('holding create failed'));
    vi.spyOn(client, 'deletePortfolio').mockRejectedValue(new Error('delete failed'));

    render(<PortfolioBuilderWizard />);

    fireEvent.change(screen.getByLabelText(/portfolio name/i), { target: { value: 'Test Portfolio' } });
    fireEvent.change(screen.getByLabelText('Capital (THB)'), { target: { value: '105000' } });
    fireEvent.click(screen.getByRole('button', { name: /preview allocation/i }));

    await waitFor(() => expect(screen.getByText(/2.0000 shares/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /create portfolio/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/holding create failed/i));
    expect(screen.getByRole('alert')).toHaveTextContent(/Test Portfolio/);
    expect(screen.getByRole('alert')).toHaveTextContent(/manually|portfolios/i);
    expect(screen.queryByRole('button', { name: /create portfolio/i })).not.toBeInTheDocument();
  });

  it('shows an error and does not create a portfolio when the USD/THB rate cannot be fetched', async () => {
    vi.spyOn(client, 'getUsdToThbRate').mockResolvedValue(null);
    vi.spyOn(client, 'getPrices').mockResolvedValue({ QQQ: 450, VUG: 300, VTI: 200, SPY: 150 });
    const createPortfolioSpy = vi.spyOn(client, 'createPortfolio');

    render(<PortfolioBuilderWizard />);

    fireEvent.change(screen.getByLabelText(/portfolio name/i), { target: { value: 'Test Portfolio' } });
    fireEvent.change(screen.getByLabelText('Capital (THB)'), { target: { value: '105000' } });
    fireEvent.click(screen.getByRole('button', { name: /preview allocation/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/usd\/thb rate/i));
    expect(screen.queryByRole('button', { name: /create portfolio/i })).not.toBeInTheDocument();
    expect(createPortfolioSpy).not.toHaveBeenCalled();
  });

  it('shows an error and does not fetch anything when capital is left at zero', async () => {
    const getPricesSpy = vi.spyOn(client, 'getPrices');
    const getUsdToThbRateSpy = vi.spyOn(client, 'getUsdToThbRate');

    render(<PortfolioBuilderWizard />);

    fireEvent.change(screen.getByLabelText(/portfolio name/i), { target: { value: 'Test Portfolio' } });
    fireEvent.click(screen.getByRole('button', { name: /preview allocation/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/capital amount/i);
    expect(getPricesSpy).not.toHaveBeenCalled();
    expect(getUsdToThbRateSpy).not.toHaveBeenCalled();
  });
});
