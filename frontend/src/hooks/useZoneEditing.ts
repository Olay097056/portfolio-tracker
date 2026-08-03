// frontend/src/hooks/useZoneEditing.ts
import { useRef, useState } from 'react';
import { createZone, deleteAllZones, deleteZone, freezeZones, updateZone } from '../api/client';
import type { ChartRange, Zone, ZoneInput } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useZoneEditing(ticker: string | null, range: ChartRange, zones: Zone[], onZonesChanged: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Mirrors `busy` synchronously so a second call arriving before the state update flushes still
  // sees the in-flight guard (state alone can lag by a render, which is exactly the double-click
  // race this guard exists to close).
  const busyRef = useRef(false);

  const isManual = zones.some((zone) => zone.source === 'manual');

  async function runMutation(mutate: () => Promise<void>): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await mutate();
      setError(null);
      onZonesChanged();
    } catch (err) {
      // Deliberately not re-thrown: the `error` state above is how callers observe failure.
      // Re-throwing here made every caller's `void hook.method(...)` produce an unhandled
      // promise rejection on top of the (correct) on-screen error banner.
      setError(toMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const addZone = (kind: Zone['kind'], price: number): Promise<void> => {
    if (ticker === null) return Promise.resolve();
    return runMutation(async () => {
      if (isManual) {
        await createZone(ticker, range, kind, price);
      } else {
        const existing: ZoneInput[] = zones.map((zone) => ({ kind: zone.kind, price: zone.price }));
        await freezeZones(ticker, range, [...existing, { kind, price }]);
      }
    });
  };

  const editZonePrice = (zoneId: number, price: number): Promise<void> =>
    runMutation(async () => {
      await updateZone(zoneId, price);
    });

  const removeZone = (zoneId: number): Promise<void> =>
    runMutation(async () => {
      await deleteZone(zoneId);
    });

  const dragZonePrice = (zone: Zone, price: number): Promise<void> => {
    if (ticker === null) return Promise.resolve();
    return runMutation(async () => {
      if (zone.source === 'manual' && zone.id !== null) {
        await updateZone(zone.id, price);
      } else {
        const updated: ZoneInput[] = zones.map((z) => ({
          kind: z.kind,
          price: z === zone ? price : z.price,
        }));
        await freezeZones(ticker, range, updated);
      }
    });
  };

  const recomputeDefaults = (): Promise<void> => {
    if (ticker === null) return Promise.resolve();
    return runMutation(async () => {
      await deleteAllZones(ticker, range);
    });
  };

  return { error, isManual, busy, addZone, editZonePrice, removeZone, dragZonePrice, recomputeDefaults };
}
