import { MacroDashboard } from '../components/tools/MacroDashboard';

// Bond-crisis — main tab that hosts the macro dashboard (yield curve, money
// market rates, credit spreads, macro assets). Moved out of Tools into its own
// top-level tab per user request; renamed from "Macro Dashboard" to "Bond-crisis".
export function BondCrisisPage() {
  return (
    <div>
      {/* ── Page Header (app style, consistent with the other main tabs) ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>📉 Bond-crisis</h2>
            <span className="badge badge-red" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
              MACRO WATCH
            </span>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            ศูนย์ติดตามวิกฤตพันธบัตรและความเสี่ยงมหภาค — Yield Curve, อัตราดอกเบี้ยตลาดเงิน, เครดิตสเปรด และสินทรัพย์มหภาค (FRED + Yahoo Finance)
          </span>
        </div>
      </div>

      <MacroDashboard />
    </div>
  );
}
