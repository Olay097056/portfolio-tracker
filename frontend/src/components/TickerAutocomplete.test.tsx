import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as client from '../api/client';
import { TickerAutocomplete } from './TickerAutocomplete';

function Harness({ theme }: { theme?: 'dark' | 'light' } = {}) {
  const [value, setValue] = useState('');
  return (
    <TickerAutocomplete
      id="test-ticker"
      value={value}
      onChange={setValue}
      onSelect={(item: { symbol: string }) => setValue(item.symbol)}
      theme={theme}
    />
  );
}

describe('TickerAutocomplete', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shows a badge + name row per real search result after the user types', async () => {
    vi.spyOn(client, 'searchStocks').mockResolvedValue([
      { symbol: 'MTUM', company_name: 'iShares MSCI USA Momentum Factor ETF' },
    ]);

    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'MTUM' } });

    expect(await screen.findByText('MTUM')).toBeInTheDocument();
    expect(screen.getByText('iShares MSCI USA Momentum Factor ETF')).toBeInTheDocument();
  });

  it('debounces so it does not call the API on every keystroke', async () => {
    const spy = vi.spyOn(client, 'searchStocks').mockResolvedValue([{ symbol: 'AAPL', company_name: 'Apple Inc.' }]);

    render(<Harness />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'A' } });
    fireEvent.change(input, { target: { value: 'AA' } });
    fireEvent.change(input, { target: { value: 'AAP' } });
    fireEvent.change(input, { target: { value: 'AAPL' } });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenLastCalledWith('AAPL');
  });

  it('calls onSelect and closes the dropdown when a suggestion is clicked', async () => {
    vi.spyOn(client, 'searchStocks').mockResolvedValue([{ symbol: 'NVDA', company_name: 'NVIDIA Corporation' }]);

    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'NVDA' } });
    const row = await screen.findByText('NVIDIA Corporation');

    fireEvent.mouseDown(row);

    await waitFor(() => expect(screen.queryByText('NVIDIA Corporation')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox')).toHaveValue('NVDA');
  });

  it('selects the active suggestion on Enter after ArrowDown', async () => {
    vi.spyOn(client, 'searchStocks').mockResolvedValue([
      { symbol: 'VOO', company_name: 'Vanguard S&P 500 ETF' },
      { symbol: 'VTI', company_name: 'Vanguard Total Stock Market ETF' },
    ]);

    render(<Harness />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'V' } });
    await screen.findByText('Vanguard S&P 500 ETF');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(input).toHaveValue('VTI'));
  });

  it('closes the dropdown on Escape without selecting anything', async () => {
    vi.spyOn(client, 'searchStocks').mockResolvedValue([{ symbol: 'SCHD', company_name: 'Schwab US Dividend Equity ETF' }]);

    render(<Harness />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'SCHD' } });
    await screen.findByText('Schwab US Dividend Equity ETF');

    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByText('Schwab US Dividend Equity ETF')).not.toBeInTheDocument());
    expect(input).toHaveValue('SCHD');
  });

  it('closes the dropdown when clicking outside', async () => {
    vi.spyOn(client, 'searchStocks').mockResolvedValue([{ symbol: 'JEPQ', company_name: 'JPMorgan Nasdaq Equity Premium Income ETF' }]);

    render(
      <div>
        <Harness />
        <div data-testid="outside">outside</div>
      </div>
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'JEPQ' } });
    await screen.findByText('JPMorgan Nasdaq Equity Premium Income ETF');

    fireEvent.mouseDown(screen.getByTestId('outside'));

    await waitFor(() => expect(screen.queryByText('JPMorgan Nasdaq Equity Premium Income ETF')).not.toBeInTheDocument());
  });

  it('does not call the API for an empty/whitespace query', async () => {
    const spy = vi.spyOn(client, 'searchStocks').mockResolvedValue([]);

    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });

    await new Promise((r) => setTimeout(r, 300));
    expect(spy).not.toHaveBeenCalled();
  });

  it('applies the light-theme dropdown class when theme="light"', async () => {
    vi.spyOn(client, 'searchStocks').mockResolvedValue([{ symbol: 'QQQ', company_name: 'Invesco QQQ Trust' }]);

    render(<Harness theme="light" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'QQQ' } });
    await screen.findByText('Invesco QQQ Trust');

    expect(document.querySelector('.ticker-ac-dropdown.light')).toBeInTheDocument();
    expect(document.querySelector('.ticker-ac-badge-light')).toBeInTheDocument();
  });

  it('silently shows no dropdown when the search API call fails', async () => {
    vi.spyOn(client, 'searchStocks').mockRejectedValue(new Error('network down'));

    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ZZZZ' } });

    await new Promise((r) => setTimeout(r, 350));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
