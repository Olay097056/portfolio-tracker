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

  it('sets an error and resolves (does not reject) when a mutation fails', async () => {
    vi.spyOn(client, 'deleteZone').mockRejectedValue(new client.ApiError(404, 'Manual zone not found'));
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    // A rejecting promise here would surface as an unhandled rejection in real usage, since
    // callers invoke these methods as `void hook.method(...)`. Awaiting it directly proves the
    // promise resolves rather than throws.
    await act(async () => {
      await expect(result.current.removeZone(5)).resolves.toBeUndefined();
    });

    await waitFor(() => expect(result.current.error).toBe('Manual zone not found'));
    expect(onZonesChanged).not.toHaveBeenCalled();
  });

  it('sets busy while a mutation is in flight and clears it on success', async () => {
    let resolveDelete: () => void;
    vi.spyOn(client, 'deleteZone').mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
    );
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));
    expect(result.current.busy).toBe(false);

    let removePromise: Promise<void>;
    act(() => {
      removePromise = result.current.removeZone(5);
    });

    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => {
      resolveDelete();
      await removePromise;
    });

    expect(result.current.busy).toBe(false);
  });

  it('clears busy after a failed mutation too', async () => {
    vi.spyOn(client, 'deleteZone').mockRejectedValue(new client.ApiError(500, 'boom'));
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    await act(async () => {
      await result.current.removeZone(5);
    });

    expect(result.current.busy).toBe(false);
    await waitFor(() => expect(result.current.error).toBe('boom'));
  });

  it('ignores a second mutation call while one is already in flight', async () => {
    let resolveDelete: () => void;
    const deleteSpy = vi.spyOn(client, 'deleteZone').mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
    );
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    let firstPromise: Promise<void>;
    let secondPromise: Promise<void>;
    act(() => {
      firstPromise = result.current.removeZone(5);
      secondPromise = result.current.removeZone(5);
    });

    await waitFor(() => expect(result.current.busy).toBe(true));
    expect(deleteSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDelete();
      await Promise.all([firstPromise, secondPromise]);
    });

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it('dragZonePrice calls updateZone directly when the dragged zone is already manual', async () => {
    vi.spyOn(client, 'updateZone').mockResolvedValue({ ...manualZone, price: 99 });
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    await act(async () => {
      await result.current.dragZonePrice(manualZone, 99);
    });

    expect(client.updateZone).toHaveBeenCalledWith(5, 99);
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it("dragZonePrice freezes the whole zone set, replacing only the dragged zone's price, when dragging an auto zone for the first time", async () => {
    const otherAutoZone = { id: null, price: 110, kind: 'resistance' as const, strength: 2, source: 'auto' as const };
    const freezeSpy = vi.spyOn(client, 'freezeZones').mockResolvedValue([]);
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [autoZone, otherAutoZone], onZonesChanged));

    await act(async () => {
      await result.current.dragZonePrice(autoZone, 93);
    });

    expect(freezeSpy).toHaveBeenCalledWith('VTI', '1Y', [
      { kind: 'support', price: 93 },
      { kind: 'resistance', price: 110 },
    ]);
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it('dragZonePrice is ignored while another mutation is already in flight', async () => {
    let resolveUpdate: (zone: client.Zone) => void;
    const updateSpy = vi.spyOn(client, 'updateZone').mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    let firstPromise: Promise<void>;
    let secondPromise: Promise<void>;
    act(() => {
      firstPromise = result.current.dragZonePrice(manualZone, 96);
      secondPromise = result.current.dragZonePrice(manualZone, 97);
    });

    await waitFor(() => expect(result.current.busy).toBe(true));
    expect(updateSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUpdate!({ ...manualZone, price: 96 });
      await Promise.all([firstPromise, secondPromise]);
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});
