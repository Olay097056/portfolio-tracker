// frontend/src/utils/zoneStyle.ts
// Single source of truth for zone-kind color/prefix — consumed by PriceChart (chart lines),
// DashboardPage (S/R/Freestyle buttons), and ZoneList (kind badges), so the three surfaces
// can never drift apart on what "support"/"resistance"/"freestyle" looks like.
import type { Zone } from '../api/types';

export const SUPPORT_COLOR = '#14b8a6'; // teal — visually distinct from this app's rebalance-severity green/yellow/red
export const RESISTANCE_COLOR = '#f59e0b'; // amber — visually distinct from this app's rebalance-severity green/yellow/red
export const FREESTYLE_COLOR = '#8b5cf6'; // violet — visually distinct from support/resistance and from this app's rebalance-severity green/yellow/red

export const ZONE_STYLE: Record<Zone['kind'], { color: string; prefix: string }> = {
  support: { color: SUPPORT_COLOR, prefix: 'S' },
  resistance: { color: RESISTANCE_COLOR, prefix: 'R' },
  freestyle: { color: FREESTYLE_COLOR, prefix: 'F' },
};
