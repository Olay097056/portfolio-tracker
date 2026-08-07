// frontend/src/components/EditPortfolioModal.tsx
import { useState, type FormEvent } from 'react';
import type { Portfolio, PortfolioTargetUpdate, PortfolioUpdateInput } from '../api/types';

interface EditPortfolioModalProps {
  portfolio: Portfolio;
  allPortfolios: Portfolio[];
  onSave: (input: PortfolioUpdateInput) => Promise<unknown>;
  onRebalance: (updates: PortfolioTargetUpdate[]) => Promise<unknown>;
  onClose: () => void;
}

const REBALANCE_TOLERANCE = 0.01;

export function EditPortfolioModal({ portfolio, allPortfolios, onSave, onRebalance, onClose }: EditPortfolioModalProps) {
  const [name, setName] = useState(portfolio.name);
  const [targetPct, setTargetPct] = useState(
    portfolio.target_allocation_pct != null ? String(portfolio.target_allocation_pct) : '',
  );
  const [rebalanceOpen, setRebalanceOpen] = useState(false);

  const otherPortfolios = allPortfolios.filter((p) => p.id !== portfolio.id);
  const [otherTargets, setOtherTargets] = useState<Record<number, string>>(() =>
    Object.fromEntries(otherPortfolios.map((p) => [p.id, p.target_allocation_pct != null ? String(p.target_allocation_pct) : '0'])),
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runningTotal =
    (Number(targetPct) || 0) + otherPortfolios.reduce((sum, p) => sum + (Number(otherTargets[p.id]) || 0), 0);
  const totalIsValid = Math.abs(runningTotal - 100) <= REBALANCE_TOLERANCE;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (rebalanceOpen && !totalIsValid) {
      setError(`Targets must sum to 100% — currently ${runningTotal.toFixed(2)}%`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const trimmedName = name.trim();
      const nameChanged = trimmedName !== portfolio.name;
      const targetNum = targetPct === '' ? null : Number(targetPct);

      if (rebalanceOpen) {
        const updates: PortfolioTargetUpdate[] = [
          { id: portfolio.id, target_allocation_pct: targetNum ?? 0 },
          ...otherPortfolios.map((p) => ({ id: p.id, target_allocation_pct: Number(otherTargets[p.id]) || 0 })),
        ];
        await onRebalance(updates);
        if (nameChanged) {
          await onSave({ name: trimmedName });
        }
      } else {
        const payload: PortfolioUpdateInput = {};
        if (nameChanged) payload.name = trimmedName;
        if (targetNum !== portfolio.target_allocation_pct) payload.target_allocation_pct = targetNum;
        await onSave(payload);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: '480px', margin: 0, background: 'var(--card-bg, #0f172a)', border: '1px solid var(--border)', padding: '24px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>Edit portfolio</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        {error && <div role="alert" style={{ marginBottom: '12px', fontSize: '0.85rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="edit-portfolio-name" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Name
            </label>
            <input
              id="edit-portfolio-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ padding: '8px 12px', fontSize: '0.9rem' }}
            />
          </div>

          <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="edit-portfolio-target" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Target allocation (%)
            </label>
            <input
              id="edit-portfolio-target"
              type="number"
              step="any"
              min="0"
              placeholder="e.g. 50"
              value={targetPct}
              onChange={(e) => setTargetPct(e.target.value)}
              style={{ padding: '8px 12px', fontSize: '0.9rem' }}
            />
          </div>

          {otherPortfolios.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <button
                type="button"
                onClick={() => setRebalanceOpen((v) => !v)}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                {rebalanceOpen ? '▲' : '▼'} Edit other portfolios' allocation
              </button>

              {rebalanceOpen && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {otherPortfolios.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <label htmlFor={`edit-other-target-${p.id}`} style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                        {p.name}
                      </label>
                      <input
                        id={`edit-other-target-${p.id}`}
                        type="number"
                        step="any"
                        min="0"
                        value={otherTargets[p.id] ?? ''}
                        onChange={(e) => setOtherTargets((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        style={{ width: '90px', padding: '6px 10px', fontSize: '0.85rem' }}
                      />
                    </div>
                  ))}

                  <div
                    role="status"
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: totalIsValid ? 'var(--green)' : 'var(--red)',
                      marginTop: '4px',
                    }}
                  >
                    Total: {runningTotal.toFixed(2)}%
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 16px', fontSize: '0.88rem', fontWeight: 600, borderRadius: '8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{ padding: '8px 20px', fontSize: '0.9rem', fontWeight: 700, borderRadius: '8px', background: 'var(--primary)', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer' }}
            >
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
