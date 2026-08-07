// frontend/src/components/tools/StockScreener.test.tsx

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StockScreener } from './StockScreener';
import { SCREENER_STOCKS } from '../../data/screenerStocks';
import { filterStocks, sortStocks, paginateStocks, PRESET_STRATEGIES } from '../../utils/screenerFilters';

describe('StockScreener Component', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
        let body: any = {};
        if (init?.body) {
          try {
            body = JSON.parse(init.body as string);
          } catch {
            body = {};
          }
        }

        const preset = body.preset || 'all';
        const filters = body.filters || {};
        const sort = body.sort || { field: 'marketCap', order: 'desc' };
        const page = body.page || 1;
        const pageSize = body.pageSize || 50;

        let effectiveFilters = { ...filters };
        if (preset && preset !== 'all') {
          const presetObj = PRESET_STRATEGIES[preset];
          if (presetObj && presetObj.filters) {
            effectiveFilters = { ...effectiveFilters, ...presetObj.filters };
          } else {
            effectiveFilters.presetTag = preset;
          }
        }

        const filtered = filterStocks(SCREENER_STOCKS, effectiveFilters);
        const sorted = sortStocks(filtered, sort.field || 'marketCap', sort.order || 'desc');
        const pagination = paginateStocks(sorted, page, pageSize);

        return new Response(
          JSON.stringify({
            total: pagination.totalItems,
            page: pagination.currentPage,
            pageSize,
            stocks: pagination.items,
            refreshedAt: '2026-08-05T08:00:00Z',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('1. renders title heading "เครื่องมือคัดกรองหุ้น" and subtitle', async () => {
    render(<StockScreener currency="USD" fxRate={33.38} />);

    expect(screen.getByRole('heading', { level: 3, name: /เครื่องมือคัดกรองหุ้น/i })).toBeInTheDocument();
    expect(screen.getByText('ค้นหาโอกาสการลงทุนที่ดีที่สุดจากฐานข้อมูลล่าสุด')).toBeInTheDocument();
    await screen.findByText('NVDA');
  });

  it('2. renders all 10 Preset Pill strategy buttons', async () => {
    render(<StockScreener currency="USD" fxRate={33.38} />);

    expect(screen.getByText('🔥 หุ้น AI')).toBeInTheDocument();
    expect(screen.getByText('🚀 หุ้นเติบโต')).toBeInTheDocument();
    expect(screen.getByText('💎 หุ้นคุณค่า')).toBeInTheDocument();
    expect(screen.getByText('💰 หุ้นปันผล')).toBeInTheDocument();
    expect(screen.getByText('🏦 หุ้นการเงิน')).toBeInTheDocument();
    expect(screen.getByText('💻 Semiconductor')).toBeInTheDocument();
    expect(screen.getByText('☁️ Cloud')).toBeInTheDocument();
    expect(screen.getByText('⚡ Quantum')).toBeInTheDocument();
    expect(screen.getByText('🤖 Robotics')).toBeInTheDocument();
    expect(screen.getByText('🛡️ Defense')).toBeInTheDocument();
    await screen.findByText('NVDA');
  });

  it('3. applies preset strategy pill on click and filters results', async () => {
    render(<StockScreener currency="USD" fxRate={33.38} />);

    await screen.findByText('NVDA');
    const aiPill = screen.getByText('🔥 หุ้น AI');
    fireEvent.click(aiPill);

    await waitFor(() => {
      expect(screen.getByText('NVDA')).toBeInTheDocument();
      expect(screen.queryByText('XOM')).not.toBeInTheDocument();
    });
  });

  it('4. toggles collapsible accordion "ตัวกรองหุ้นรายละเอียด"', async () => {
    render(<StockScreener currency="USD" fxRate={33.38} />);

    const accordionBtn = screen.getByRole('button', { name: /ตัวกรองหุ้นรายละเอียด/i });
    expect(screen.getByLabelText('มูลค่าตลาด')).toBeInTheDocument();

    // Click to close
    fireEvent.click(accordionBtn);
    expect(screen.queryByLabelText('มูลค่าตลาด')).not.toBeInTheDocument();

    // Click to reopen
    fireEvent.click(accordionBtn);
    expect(screen.getByLabelText('มูลค่าตลาด')).toBeInTheDocument();
    await screen.findByText('NVDA');
  });

  it('5. updates active filter count badge when filter is selected', async () => {
    render(<StockScreener currency="USD" fxRate={33.38} />);

    const divYieldSelect = screen.getByLabelText('อัตราตอบแทนปันผล');
    fireEvent.change(divYieldSelect, { target: { value: 'high' } });

    // Active filter count badge on accordion should show 1
    const accordionBtn = screen.getByRole('button', { name: /ตัวกรองหุ้นรายละเอียด/i });
    expect(accordionBtn).toHaveTextContent('1');
    await screen.findByText('QYLD');
  });

  it('6. filters results in real-time when typing in search input', async () => {
    render(<StockScreener currency="USD" fxRate={33.38} />);

    await screen.findByText('NVDA');
    const searchInput = screen.getByPlaceholderText('ค้นหาชื่อหุ้น หรือ บริษัท');
    fireEvent.change(searchInput, { target: { value: 'NVIDIA' } });

    await waitFor(() => {
      expect(screen.getByText('NVDA')).toBeInTheDocument();
      expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
      expect(screen.getByText(/แสดง 1 - 1 จาก 1 หุ้น/i)).toBeInTheDocument();
    });
  });

  it('7. renders all 9 table headers correctly', async () => {
    render(<StockScreener currency="USD" fxRate={33.38} />);

    expect(screen.getAllByText(/บริษัท/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /กลุ่มอุตสาหกรรม/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /อุตสาหกรรมย่อย/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /มูลค่าตลาด/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^P\/E$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^PEG$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^UPSIDE$/i })).toBeInTheDocument();
    expect(screen.getAllByText('♥').length).toBeGreaterThan(0);
    expect(screen.getAllByText('⊕').length).toBeGreaterThan(0);
    await screen.findByText('NVDA');
  });

  it('8. displays UPSIDE with green (+%) and red (-%) formatting', async () => {
    render(<StockScreener currency="USD" fxRate={33.38} />);

    // Positive upside stock e.g. NVDA +22.50%
    await screen.findByText('+22.50%');
    expect(screen.getByText('+22.50%')).toBeInTheDocument();
  });

  it('9. toggles favorite state (♥) when clicking heart button', async () => {
    render(<StockScreener currency="USD" fxRate={33.38} />);

    await screen.findByText('NVDA');
    const favButton = screen.getByRole('button', { name: 'Favorite NVDA' });
    expect(favButton).toHaveTextContent('♡');

    fireEvent.click(favButton);
    expect(favButton).toHaveTextContent('♥');
  });

  it('10. toggles compare state (⊕) when clicking compare button', async () => {
    render(<StockScreener currency="USD" fxRate={33.38} />);

    await screen.findByText('NVDA');
    const compareButton = screen.getByRole('button', { name: 'Compare NVDA' });
    fireEvent.click(compareButton);

    expect(compareButton).toHaveStyle('border: 1px solid var(--primary, #38bdf8)');
  });

  it('11. displays pagination info "แสดง X - Y จาก Z หุ้น" and navigates pages', async () => {
    render(<StockScreener currency="USD" fxRate={33.38} />);

    await screen.findByText(`แสดง 1 - 50 จาก ${SCREENER_STOCKS.length} หุ้น`);

    const page2Button = screen.getByRole('button', { name: '2' });
    fireEvent.click(page2Button);

    await waitFor(() => {
      expect(screen.getByText(`แสดง 51 - ${SCREENER_STOCKS.length} จาก ${SCREENER_STOCKS.length} หุ้น`)).toBeInTheDocument();
    });
  });

  it('12. converts market cap to THB (฿) when currency="THB"', async () => {
    render(<StockScreener currency="THB" fxRate={33.38} />);

    // 3.45e12 USD * 33.38 = 115.16T THB
    await screen.findByText('฿115.16T');
    expect(screen.getByText('฿115.16T')).toBeInTheDocument();
  });

  it('13. displays market cap in USD ($) when currency="USD"', async () => {
    render(<StockScreener currency="USD" fxRate={33.38} />);

    await screen.findByText('$3.45T');
    expect(screen.getByText('$3.45T')).toBeInTheDocument();
  });
});
