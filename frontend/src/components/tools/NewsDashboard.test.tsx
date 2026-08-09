import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { NewsDashboard } from './NewsDashboard';
import type { NewsList } from '../../api/types';

vi.mock('../../api/client', () => ({
  getNews: vi.fn(),
  refreshNews: vi.fn(),
}));

const mockGetNews = vi.mocked(client.getNews);
const mockRefreshNews = vi.mocked(client.refreshNews);

const FIXTURE: NewsList = {
  count: 25,
  page: 1,
  page_size: 20,
  pages: 2,
  sources: ['ZeroHedge', 'CNBC'],
  updated_at: '09/08/2026 10:00:00 UTC',
  items: [
    {
      id: 'n1',
      title: 'Iran sets conditions for opening Strait of Hormuz',
      summary: 'Oil spiked on closure fears.',
      url: 'https://example.com/hormuz',
      source: 'CNBC',
      category: 'energy',
      impact_score: 75,
      published_at: '2026-08-09T08:00:00Z',
      title_th: 'อิหร่านตั้งเงื่อนไขเปิดช่องแคบฮอร์มุซ',
      analysis_th: 'ข่าวนี้กดดันราคาน้ำมันพุ่ง กระทบเงินเฟ้อและพันธบัตรสหรัฐฯ',
      related_models: ['inflation-oil', 'yield-shock'],
    },
    {
      id: 'n2',
      title: 'Messi father dies',
      summary: null,
      url: 'https://example.com/messi',
      source: 'ZeroHedge',
      category: 'world',
      impact_score: 0,
      published_at: '2026-08-09T07:00:00Z',
      title_th: 'พ่อของเมสซีเสียชีวิต',
      analysis_th: null,
      related_models: [],
    },
    {
      id: 'n3',
      title: 'Untranslated headline still shows',
      summary: 'No Thai yet — background enrichment pending.',
      url: 'https://example.com/raw',
      source: 'CNBC',
      category: 'market',
      impact_score: null,
      published_at: '2026-08-09T06:00:00Z',
      title_th: null,
      analysis_th: null,
      related_models: [],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetNews.mockResolvedValue(FIXTURE);
  mockRefreshNews.mockResolvedValue(FIXTURE);
});

describe('NewsDashboard', () => {
  it('renders headlines with Thai titles, impact scores and model badges', async () => {
    render(<NewsDashboard />);
    await waitFor(() => {
      expect(screen.getByText('อิหร่านตั้งเงื่อนไขเปิดช่องแคบฮอร์มุซ')).toBeTruthy();
    });
    // impact scores
    expect(screen.getByText('75')).toBeTruthy();
    // category pill
    expect(screen.getAllByText('พลังงาน').length).toBeGreaterThan(0);
    // model badges (Thai labels)
    expect(screen.getByText('เงินเฟ้อ/น้ำมัน')).toBeTruthy();
    expect(screen.getByText('Yield ช็อก')).toBeTruthy();
    // source + count header
    expect(screen.getByText(/25 ข่าว/)).toBeTruthy();
  });

  it('falls back to the English title when title_th is null', async () => {
    render(<NewsDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Untranslated headline still shows')).toBeTruthy();
    });
  });

  it('expands the analysis panel on click', async () => {
    render(<NewsDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/บทวิเคราะห์/)).toBeTruthy();
    });
    fireEvent.click(screen.getByText(/บทวิเคราะห์/));
    await waitFor(() => {
      expect(screen.getByText(/ข่าวนี้กดดันราคาน้ำมันพุ่ง/)).toBeTruthy();
    });
  });

  it('re-fetches with sort / filter / page parameters', async () => {
    render(<NewsDashboard />);
    await waitFor(() => expect(mockGetNews).toHaveBeenCalled());

    fireEvent.change(screen.getByDisplayValue('เรียงตามวันที่'), {
      target: { value: 'impact' },
    });
    await waitFor(() => {
      expect(mockGetNews).toHaveBeenCalledWith(1, 'impact', undefined, undefined);
    });

    fireEvent.change(screen.getByDisplayValue('ทุกแหล่ง'), {
      target: { value: 'CNBC' },
    });
    await waitFor(() => {
      expect(mockGetNews).toHaveBeenCalledWith(1, 'impact', 'CNBC', undefined);
    });

    fireEvent.change(screen.getByDisplayValue('IMPACT ≥ ใดก็ได้'), {
      target: { value: '40' },
    });
    await waitFor(() => {
      expect(mockGetNews).toHaveBeenCalledWith(1, 'impact', 'CNBC', 40);
    });
  });

  it('paginates to page 2', async () => {
    render(<NewsDashboard />);
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
    fireEvent.click(screen.getByText('2'));
    await waitFor(() => {
      expect(mockGetNews).toHaveBeenCalledWith(2, 'date', undefined, undefined);
    });
  });

  it('refresh button calls refreshNews then reloads', async () => {
    render(<NewsDashboard />);
    await waitFor(() => expect(mockGetNews).toHaveBeenCalled());
    fireEvent.click(screen.getByText(/รีเฟรช/));
    await waitFor(() => expect(mockRefreshNews).toHaveBeenCalled());
  });

  it('shows retry state when loading fails', async () => {
    mockGetNews.mockRejectedValueOnce(new Error('network'));
    render(<NewsDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/โหลดข่าวไม่สำเร็จ/)).toBeTruthy();
    });
    expect(screen.getByText('ลองใหม่')).toBeTruthy();
  });
});
