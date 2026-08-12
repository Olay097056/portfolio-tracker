// Shared data-tier badge — extracted from BoardroomDashboard.tsx:235
// Used by CountriesDashboard + CountryDetailPage (ticket 07, sub-task 7.2)
import type { ReactElement } from 'react';

export interface DataTierBadgeProps {
  /** raw tier key from backend (realtime, daily, sparse, manual) */
  tier: string;
  /** fallback text when tier is unknown (e.g. data_tier_note_th) */
  fallback?: string;
}

const TIER_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  realtime: {
    label: 'ข้อมูลเรียลไทม์',
    color: '#34d399',
    bg: 'rgba(52,211,153,0.12)',
    border: 'rgba(52,211,153,0.35)',
  },
  daily: {
    label: 'ข้อมูลรายวัน',
    color: '#38bdf8',
    bg: 'rgba(56,189,248,0.12)',
    border: 'rgba(56,189,248,0.35)',
  },
  sparse: {
    label: 'ข้อมูลจำกัด อาจล่าช้าบางวัน',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.35)',
  },
  manual: {
    label: 'ไม่มีตลาดรอง — ติดตามผ่านอันดับเครดิตและข่าว',
    color: '#8a97ad',
    bg: 'rgba(138,151,173,0.12)',
    border: 'rgba(138,151,173,0.35)',
  },
};

export function DataTierBadge({ tier, fallback }: DataTierBadgeProps): ReactElement | null {
  const meta = TIER_META[tier];
  const label = meta?.label ?? fallback;
  if (!label) return null;

  const { color, bg, border } = meta ?? { color: '#8a97ad', bg: 'rgba(138,151,173,0.12)', border: 'rgba(138,151,173,0.35)' };

  return (
    <span
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: bg,
        color,
        padding: '1px 8px',
        fontSize: 10,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
