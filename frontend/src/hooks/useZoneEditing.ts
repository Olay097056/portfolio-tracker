// frontend/src/hooks/useZoneEditing.ts
import { useState } from 'react';
import { createZone, deleteAllZones, deleteZone, freezeZones, updateZone } from '../api/client';
import type { ChartRange, Zone, ZoneInput } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useZoneEditing(ticker: string | null, range: ChartRange, zones: Zone[], onZonesChanged: () => void) {
  const [error, setError] = useState<string | null>(null);

  const isManual = zones.some((zone) => zone.source === 'manual');

  const addZone = async (kind: Zone['kind'], price: number) => {
    if (ticker === null) return;
    try {
      if (isManual) {
        await createZone(ticker, range, kind, price);
      } else {
        const existing: ZoneInput[] = zones.map((zone) => ({ kind: zone.kind, price: zone.price }));
        await freezeZones(ticker, range, [...existing, { kind, price }]);
      }
      setError(null);
      onZonesChanged();
    } catch (err) {
      setError(toMessage(err));
      throw err;
    }
  };

  const editZonePrice = async (zoneId: number, price: number) => {
    try {
      await updateZone(zoneId, price);
      setError(null);
      onZonesChanged();
    } catch (err) {
      setError(toMessage(err));
      throw err;
    }
  };

  const removeZone = async (zoneId: number) => {
    try {
      await deleteZone(zoneId);
      setError(null);
      onZonesChanged();
    } catch (err) {
      setError(toMessage(err));
      throw err;
    }
  };

  const recomputeDefaults = async () => {
    if (ticker === null) return;
    try {
      await deleteAllZones(ticker, range);
      setError(null);
      onZonesChanged();
    } catch (err) {
      setError(toMessage(err));
      throw err;
    }
  };

  return { error, isManual, addZone, editZonePrice, removeZone, recomputeDefaults };
}
