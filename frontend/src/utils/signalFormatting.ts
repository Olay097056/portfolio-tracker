// frontend/src/utils/signalFormatting.ts
export function formatSignedPercent(value: number | null | undefined): string {
  return value == null ? 'Unavailable' : `${value.toFixed(2)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  return value == null ? 'Unavailable' : value.toFixed(2);
}

// Gain/loss color for an actual price-change value — deliberately NOT used for every
// signed-percent column in this app (RSI, ATR, Bollinger Band width, dividend yield, etc. have
// no inherent "good"/"bad" direction). Only pass values that represent a real price change.
// Returns undefined (no color override) when the value is unavailable, so an "Unavailable" cell
// never gets a fabricated color.
export function changeColor(value: number | null | undefined): string | undefined {
  return value == null ? undefined : value >= 0 ? 'var(--green)' : 'var(--red)';
}
