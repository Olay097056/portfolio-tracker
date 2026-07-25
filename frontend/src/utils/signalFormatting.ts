// frontend/src/utils/signalFormatting.ts
export function formatSignedPercent(value: number | null | undefined): string {
  return value == null ? 'Unavailable' : `${value.toFixed(2)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  return value == null ? 'Unavailable' : value.toFixed(2);
}
