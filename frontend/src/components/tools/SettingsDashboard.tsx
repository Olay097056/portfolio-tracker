import { useEffect, useState } from 'react';
import { RiskBanner } from './RiskBanner';

// ตั้งค่า — หน้า /settings ของ reference (ใบ 11): บัญชี + รูปแบบการแจ้งเตือน
// (Telegram ถูกตัดออกตามใบ 09) — เก็บใน localStorage (ยังไม่มีระบบ auth)

const INK = {
  panel: 'var(--panel)',
  panelBorder: 'var(--border)',
  ink: 'var(--text)',
  inkDim: 'var(--text-muted)',
  inkFaint: 'var(--text-dim)',
  accent: 'var(--primary)',
  emerald: '#34d399',
  amber: '#fbbf24',
};

interface AlertPref {
  id: string;
  label: string;
  desc: string;
  enabled: boolean;
}

const DEFAULT_PREFS: AlertPref[] = [
  { id: 'jgb_10y', label: 'JGB 10 ปี ทะลุ 2.5%', desc: 'สัญญาณแบงก์รันเริ่มต้นของญี่ปุ่น', enabled: true },
  { id: 'auction_tail', label: 'หางประมูล 10Y', desc: 'ความต้องการอ่อนแอในการประมูลพันธบัตร', enabled: true },
  { id: 'banking_composite', label: 'ดัชนีความเสี่ยงแบงก์รัน', desc: 'เมื่อ composite ขึ้นเกิน 60', enabled: true },
  { id: 'hy_spread', label: 'HY spread พุ่ง', desc: 'ส่วนต่างพันธบัตร junk ขยายตัว', enabled: false },
  { id: 'curve_inversion', label: 'เส้นโค้งกลับด้าน', desc: '10Y-2Y ติดลบ', enabled: false },
  { id: 'model_regime', label: 'Regime เปลี่ยน', desc: 'โมเดลอันดับ 1 สลับตัว', enabled: true },
];

const PREFS_KEY = 'bondcrisis:alert_prefs';
const PROFILE_KEY = 'bondcrisis:profile';

export function SettingsDashboard() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [prefs, setPrefs] = useState<AlertPref[]>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const p = localStorage.getItem(PREFS_KEY);
      if (p) setPrefs(JSON.parse(p));
      const prof = localStorage.getItem(PROFILE_KEY);
      if (prof) {
        const d = JSON.parse(prof);
        setName(d.name ?? '');
        setEmail(d.email ?? '');
      }
    } catch { /* ignore */ }
  }, []);

  const saveProfile = () => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, email }));
    } catch { /* ignore */ }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const togglePref = (id: string) => {
    setPrefs((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const box: React.CSSProperties = {
    background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 16,
  };
  const label: React.CSSProperties = {
    fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: INK.inkFaint, marginBottom: 12,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 🚫 Risk warning (D18 — ticket 06) */}
      <RiskBanner id="settings" />
      {/* ── บัญชี ── */}
      <div style={box}>
        <div style={label}>บัญชี</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: INK.inkDim, marginBottom: 4 }}>ชื่อ</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อของคุณ"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.85rem',
                background: 'var(--panel)', border: `1px solid ${INK.panelBorder}`, color: INK.ink, outline: 'none',
              }} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: INK.inkDim, marginBottom: 4 }}>อีเมล</div>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.85rem',
                background: 'var(--panel)', border: `1px solid ${INK.panelBorder}`, color: INK.ink, outline: 'none',
              }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={saveProfile} style={{
              padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
              background: INK.accent, border: 'none', color: '#ffffff',
            }}>บันทึก</button>
            {saved && <span style={{ color: INK.emerald, fontSize: '0.75rem' }}>✓ บันทึกแล้ว</span>}
          </div>
        </div>
      </div>

      {/* ── รูปแบบการแจ้งเตือน ── */}
      <div style={box}>
        <div style={label}>รูปแบบการแจ้งเตือน</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {prefs.map((p) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              background: 'var(--panel)', border: `1px solid ${INK.panelBorder}`, borderRadius: 10,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: INK.ink }}>{p.label}</div>
                <div style={{ fontSize: '0.7rem', color: INK.inkFaint }}>{p.desc}</div>
              </div>
              <button onClick={() => togglePref(p.id)} aria-label={p.label} style={{
                width: 40, height: 22, borderRadius: 11, cursor: 'pointer', position: 'relative',
                background: p.enabled ? INK.emerald : INK.panelBorder, border: 'none', transition: 'background 0.2s',
              }}>
                <span style={{
                  position: 'absolute', top: 2, left: p.enabled ? 20 : 2, width: 18, height: 18,
                  borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                }} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '0.68rem', color: INK.inkFaint, marginTop: 10 }}>
          เก็บในเบราว์เซอร์ของคุณ (localStorage) · การแจ้งเตือน Telegram ยังไม่รองรับในเวอร์ชันนี้
        </div>
      </div>
    </div>
  );
}
