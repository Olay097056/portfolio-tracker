import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LearnDashboard } from './LearnDashboard';
import { SettingsDashboard } from './SettingsDashboard';

describe('LearnDashboard', () => {
  it('renders 7 lessons and marks complete via localStorage', async () => {
    render(<LearnDashboard />);
    await waitFor(() => expect(screen.getByText('🧭')).toBeTruthy());
    expect(screen.getByText('เข็มทิศตลาดพันธบัตร')).toBeTruthy();
    expect(screen.getByText('ธงสัญญาณเตือน')).toBeTruthy();
    expect(screen.getByText(/เรียนจบ 0\/7 บท/)).toBeTruthy();

    const lessonBtn = screen.getByText('เข็มทิศตลาดพันธบัตร').closest('button');
    expect(lessonBtn).toBeTruthy();
    fireEvent.click(lessonBtn!);
    await waitFor(() => expect(screen.getByText(/Yield Curve คืออะไร/)).toBeTruthy());
    fireEvent.click(screen.getByText('ทำเครื่องหมายเรียนจบ'));
    await waitFor(() => expect(screen.getByText(/เรียนจบ 1\/7 บท/)).toBeTruthy());
  });
});

describe('SettingsDashboard', () => {
  it('renders profile + alert prefs and toggles', async () => {
    render(<SettingsDashboard />);
    await waitFor(() => expect(screen.getByText('บัญชี')).toBeTruthy());
    expect(screen.getByText('รูปแบบการแจ้งเตือน')).toBeTruthy();
    expect(screen.getByText('JGB 10 ปี ทะลุ 2.5%')).toBeTruthy();
    expect(screen.getByText(/Telegram ยังไม่รองรับ/)).toBeTruthy();

    const toggles = screen.getAllByRole('button', { name: /JGB|หางประมูล|ดัชนี|HY|เส้นโค้ง|Regime/ });
    expect(toggles.length).toBeGreaterThan(0);
  });
});
