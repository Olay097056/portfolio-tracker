import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { EtfComparisonTool } from './EtfComparisonTool';

describe('EtfComparisonTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and shows prices for two entered tickers side by side', async () => {
    vi.spyOn(client, 'getPrices').mockResolvedValue({ VTI: 210, SPY: 150 });

    render(<EtfComparisonTool />);
    fireEvent.change(screen.getByLabelText(/ticker a/i), { target: { value: 'VTI' } });
    fireEvent.change(screen.getByLabelText(/ticker b/i), { target: { value: 'SPY' } });
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    await waitFor(() => expect(screen.getByText('$210.00')).toBeInTheDocument());
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(client.getPrices).toHaveBeenCalledWith(['VTI', 'SPY']);
  });

  it('shows "Price unavailable" for a ticker whose price could not be fetched, without fabricating one', async () => {
    vi.spyOn(client, 'getPrices').mockResolvedValue({ VTI: 210 });

    render(<EtfComparisonTool />);
    fireEvent.change(screen.getByLabelText(/ticker a/i), { target: { value: 'VTI' } });
    fireEvent.change(screen.getByLabelText(/ticker b/i), { target: { value: 'SPY' } });
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    await waitFor(() => expect(screen.getByText('$210.00')).toBeInTheDocument());
    expect(screen.getByText('Price unavailable')).toBeInTheDocument();
  });

  it('wraps its content in a card', () => {
    const { container } = render(<EtfComparisonTool />);

    expect(container.querySelector('.card')).not.toBeNull();
  });

  it('zebra-stripes the results table', async () => {
    vi.spyOn(client, 'getPrices').mockResolvedValue({ VTI: 210, SPY: 150 });

    const { container } = render(<EtfComparisonTool />);
    fireEvent.change(screen.getByLabelText(/ticker a/i), { target: { value: 'VTI' } });
    fireEvent.change(screen.getByLabelText(/ticker b/i), { target: { value: 'SPY' } });
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    await waitFor(() => expect(screen.getByText('$210.00')).toBeInTheDocument());
    expect(container.querySelector('table.zebra-table')).not.toBeNull();
  });

  it('shows an error and does not call getPrices when a ticker field is left blank', () => {
    const getPricesSpy = vi.spyOn(client, 'getPrices');

    render(<EtfComparisonTool />);
    fireEvent.change(screen.getByLabelText(/ticker a/i), { target: { value: 'VTI' } });
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/enter both tickers/i);
    expect(getPricesSpy).not.toHaveBeenCalled();
  });
});
