// frontend/src/hooks/useZoneEditing.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useZoneEditing } from './useZoneEditing';

const autoZone = { id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const };
const manualZone = { id: 5, price: 95, kind: 'support' as const, strength: null, source: 'manual' as const };

describe('useZoneEditing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports isManual as false when zones is empty or all-auto', () => {
    const { result: empty } = renderHook(() => useZoneEditing('VTI', '1Y', [], vi.fn()));
    expect(empty.current.isManual).toBe(false);

    const { result: auto } = renderHook(() => useZoneEditing('VTI', '1Y', [autoZone], vi.fn()));
    expect(auto.current.isManual).toBe(false);
  });

  it('reports isManual as true when zones has a manual zone', () => {
    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], vi.fn()));
    expect(result.current.isManual).toBe(true);
  });

  it('addZone calls freezeZones with every current zone plus the new one when not yet manual', async () => {
    const freezeSpy = vi.spyOn(client, 'freezeZones').mockResolvedValue([]);
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [autoZone], onZonesChanged));

    await act(async () => {
      await result.current.addZone('resistance', 110);
    });

    expect(freezeSpy).toHaveBeenCalledWith('VTI', '1Y', [
      { kind: 'support', price: 95 },
      { kind: 'resistance', price: 110 },
    ]);
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it('addZone calls createZone directly when already manual', async () => {
    const createSpy = vi.spyOn(client, 'createZone').mockResolvedValue(manualZone);
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    await act(async () => {
      await result.current.addZone('resistance', 110);
    });

    expect(createSpy).toHaveBeenCalledWith('VTI', '1Y', 'resistance', 110);
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it('editZonePrice calls updateZone and reports the request through onZonesChanged', async () => {
    vi.spyOn(client, 'updateZone').mockResolvedValue({ ...manualZone, price: 97 });
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    await act(async () => {
      await result.current.editZonePrice(5, 97);
    });

    expect(client.updateZone).toHaveBeenCalledWith(5, 97);
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it('removeZone calls deleteZone', async () => {
    vi.spyOn(client, 'deleteZone').mockResolvedValue(undefined);
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    await act(async () => {
      await result.current.removeZone(5);
    });

    expect(client.deleteZone).toHaveBeenCalledWith(5);
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it('recomputeDefaults calls deleteAllZones with the current ticker and range', async () => {
    vi.spyOn(client, 'deleteAllZones').mockResolvedValue(undefined);
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    await act(async () => {
      await result.current.recomputeDefaults();
    });

    expect(client.deleteAllZones).toHaveBeenCalledWith('VTI', '1Y');
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it('sets an error and re-throws when a mutation fails', async () => {
    vi.spyOn(client, 'deleteZone').mockRejectedValue(new client.ApiError(404, 'Manual zone not found'));
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.removeZone(5);
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    await waitFor(() => expect(result.current.error).toBe('Manual zone not found'));
    expect(onZonesChanged).not.toHaveBeenCalled();
  });
});
