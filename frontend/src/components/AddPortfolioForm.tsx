// frontend/src/components/AddPortfolioForm.tsx
import { useState, type FormEvent } from 'react';
import type { PortfolioCreateInput } from '../api/types';

interface AddPortfolioFormProps {
  onSubmit: (input: PortfolioCreateInput) => void | Promise<void>;
  onClose?: () => void;
  isModal?: boolean;
}

export function AddPortfolioForm({ onSubmit, onClose, isModal = false }: AddPortfolioFormProps) {
  const [name, setName] = useState('');
  const [cash, setCash] = useState('');
  const [targetAllocation, setTargetAllocation] = useState('');
  const [isOpen, setIsOpen] = useState(!isModal);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    try {
      const payload: PortfolioCreateInput = {
        name: name.trim(),
        cash_usd: cash === '' ? 0 : Number(cash),
      };
      if (targetAllocation !== '') {
        payload.target_allocation_pct = Number(targetAllocation);
      }
      await onSubmit(payload);
      setName('');
      setCash('');
      setTargetAllocation('');
      if (onClose) onClose();
      if (isModal) setIsOpen(false);
    } catch {
      // Leave fields populated on submit error
    }
  }

  const formContent = (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="portfolio-name" style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-muted)' }}>Name</label>
          <input
            id="portfolio-name"
            placeholder="e.g. DIME, Core, Dividend"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ padding: '8px 12px', fontSize: '0.9rem' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="portfolio-cash" style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-muted)' }}>Cash (USD)</label>
          <input
            id="portfolio-cash"
            type="number"
            step="any"
            min="0"
            placeholder="0.00"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            style={{ padding: '8px 12px', fontSize: '0.9rem' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="portfolio-target-allocation" style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-muted)' }}>Target Allocation (%)</label>
          <input
            id="portfolio-target-allocation"
            type="number"
            step="any"
            min="0"
            placeholder="e.g. 50"
            value={targetAllocation}
            onChange={(e) => setTargetAllocation(e.target.value)}
            style={{ padding: '8px 12px', fontSize: '0.9rem' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
        {(isModal || onClose) && (
          <button
            type="button"
            onClick={() => {
              if (onClose) onClose();
              if (isModal) setIsOpen(false);
            }}
            style={{ padding: '8px 16px', fontSize: '0.88rem', fontWeight: 600, borderRadius: '8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          style={{
            padding: '8px 20px',
            fontSize: '0.9rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          + Add portfolio
        </button>
      </div>
    </form>
  );

  if (isModal) {
    if (!isOpen) {
      return (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          style={{ padding: '8px 18px', fontSize: '0.85rem', fontWeight: 600, borderRadius: '8px', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid var(--primary)', color: 'var(--primary)', cursor: 'pointer' }}
        >
          ➕ Add Portfolio
        </button>
      );
    }

    return (
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            if (onClose) onClose();
            setIsOpen(false);
          }
        }}
      >
        <div style={{ background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)', borderRadius: '16px', border: '1px solid rgba(56, 189, 248, 0.3)', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)', width: '100%', maxWidth: '560px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>💼 Create New Portfolio</h3>
            <button type="button" onClick={() => { if (onClose) onClose(); setIsOpen(false); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          </div>
          {formContent}
        </div>
      </div>
    );
  }

  return formContent;
}
