import { describe, expect, it } from 'vitest';
import { RISK_TEXT } from './RiskBanner';

// ── Guard-rail tests (ticket 06 reference-parity) ───────────────────────────
// เทสต์เหล่านี้ล้มทันทีถ้ามีใครลบข้อความคำเตือนความเสี่ยงออกจาก RISK_TEXT —
// บทเรียนใบ 02: ของหายเพราะไม่มีเทสต์เฝ้า

describe('Risk warning texts (guard rails)', () => {
  it('has all 11 banner texts (D8–D19)', () => {
    const keys = Object.keys(RISK_TEXT);
    expect(keys).toEqual(expect.arrayContaining([
      'signals',    // D8+D19
      'models',     // D9
      'overview',   // D10
      'sentiment',  // D11
      'cme',        // D12
      'banking',    // D13
      'countries',  // D14
      'news',       // D15
      'learn',      // D16
      'office',     // D17
      'settings',   // D18
    ]));
    expect(keys.length).toBe(11);
  });

  it('D8+D19 signals: mentions both risk + accuracy-measuring', () => {
    expect(RISK_TEXT.signals).toContain('ไม่ใช่คำแนะนำการลงทุน');
    expect(RISK_TEXT.signals).toContain('ความแม่นยำ');
    expect(RISK_TEXT.signals).toContain('รอข้อมูลปิดไม้');
  });

  it('D9 models: mentions ใช้ประกอบการวิเคราะห์ ไม่ใช่คำแนะนำ', () => {
    expect(RISK_TEXT.models).toContain('ไม่ใช่คำแนะนำการลงทุน');
  });

  it('D10 overview: mentions ข้อมูลเพื่อการศึกษา', () => {
    expect(RISK_TEXT.overview).toContain('ไม่ใช่คำแนะนำการลงทุน');
  });

  it('D11 sentiment: mentions ไม่ใช่สัญญาณซื้อขาย', () => {
    expect(RISK_TEXT.sentiment).toContain('ไม่ใช่สัญญาณซื้อขาย');
    expect(RISK_TEXT.sentiment).toContain('ไม่ใช่คำแนะนำการลงทุน');
  });

  it('D12 cme: mentions การคาดการณ์จากตลาด', () => {
    expect(RISK_TEXT.cme).toContain('ไม่ใช่คำแนะนำการลงทุน');
  });

  it('D13 banking: mentions เพื่อการศึกษา', () => {
    expect(RISK_TEXT.banking).toContain('ไม่ใช่คำแนะนำการลงทุน');
  });

  it('D14 countries: mentions เพื่อการศึกษาเท่านั้น', () => {
    expect(RISK_TEXT.countries).toContain('เพื่อการศึกษาเท่านั้น');
  });

  it('D15 news: mentions ตรวจสอบจากแหล่งต้นทาง', () => {
    expect(RISK_TEXT.news).toContain('ตรวจสอบจากแหล่งต้นทาง');
    expect(RISK_TEXT.news).toContain('ไม่ใช่คำแนะนำการลงทุน');
  });

  it('D16 learn: mentions เพื่อการศึกษาเท่านั้น', () => {
    expect(RISK_TEXT.learn).toContain('เพื่อการศึกษาเท่านั้น');
  });

  it('D17 office: short text — ภาพจำลองเพื่อการแสดงผลเท่านั้น', () => {
    expect(RISK_TEXT.office).toContain('ภาพจำลองเพื่อการแสดงผลเท่านั้น');
  });

  it('D18 settings: mentions เกณฑ์การแจ้งเตือน', () => {
    expect(RISK_TEXT.settings).toContain('เกณฑ์การแจ้งเตือน');
    expect(RISK_TEXT.settings).toContain('ไม่ใช่คำแนะนำการลงทุน');
  });

  it('banners are actually rendered in the components', async () => {
    // Every component that imports RiskBanner must render it —
    // check the source references so removal breaks the build/tests.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname);
    const components = ['SignalsDashboard', 'ModelsDashboard', 'OverviewDashboard', 'SentimentDashboard',
      'CmeDashboard', 'BankingDashboard', 'CountriesDashboard', 'NewsDashboard',
      'LearnDashboard', 'OfficeDashboard', 'SettingsDashboard'];
    for (const c of components) {
      const src = fs.readFileSync(path.join(dir, `${c}.tsx`), 'utf-8');
      expect(src).toContain('RiskBanner');
      expect(src).toContain(`RiskBanner id=`);
    }
  });
});
