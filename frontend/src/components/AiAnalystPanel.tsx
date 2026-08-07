// frontend/src/components/AiAnalystPanel.tsx
// The AI (local LLM) narrative panel for the AI Technical Signal feature — wayfinder ticket 09
// (wiring) / ticket 05 (this design, "Variant B — side-by-side sidebar", chosen after a
// 3-variant /prototype comparison; see .scratch/ai-signal-upgrade/issues/05-dual-display-prototype.md
// for the other two variants and why this one won). Rendered next to the deterministic system
// score via the `.ai-signal-split` grid in DashboardPage.tsx — spatially parallel, never one
// replacing the other, per ticket 04's contract.
import type { AiNarrativeState } from '../hooks/useAiNarrative';

interface AiAnalystPanelProps {
  state: AiNarrativeState;
  onAnalyze: () => void;
  disabled: boolean;
}

function ConflictCallout({ signals }: { signals: string[] }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        background: 'rgba(245, 158, 11, 0.12)',
        border: '1px solid rgba(245, 158, 11, 0.4)',
        borderRadius: '8px',
        padding: '10px 12px',
        marginBottom: '10px',
      }}
    >
      <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>⚡</span>
      <div>
        <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '0.82rem', marginBottom: '2px' }}>สัญญาณขัดแย้งกัน</div>
        <div style={{ fontSize: '0.82rem', color: '#fcd34d' }}>{signals.join(' • ')}</div>
      </div>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
      <span
        style={{
          display: 'inline-block',
          width: '16px',
          height: '16px',
          border: '2px solid rgba(56,189,248,0.25)',
          borderTopColor: '#38bdf8',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>กำลังวิเคราะห์ด้วย AI... (อาจใช้เวลาถึง 40 วินาที)</span>
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}

const SENTIMENT_META: Record<string, { label: string; color: string }> = {
  bullish: { label: '🟢 BULLISH', color: '#34d399' },
  bearish: { label: '🔴 BEARISH', color: '#f43f5e' },
  neutral: { label: '🟡 NEUTRAL', color: '#f59e0b' },
};

function ResultBody({ result }: { result: Extract<AiNarrativeState, { status: 'success' }>['result'] }) {
  const meta = SENTIMENT_META[result.sentiment] ?? SENTIMENT_META.neutral;
  return (
    <div>
      {result.conflicting_signals && result.conflicting_signals.length > 0 && <ConflictCallout signals={result.conflicting_signals} />}
      <p style={{ margin: '0 0 8px 0', fontWeight: 800, color: meta.color, fontSize: '0.85rem' }}>{meta.label}</p>
      <p style={{ margin: '0 0 8px 0', color: '#e2e8f0', fontSize: '0.85rem', lineHeight: 1.5 }}>{result.narrative}</p>
      {result.caveats.length > 0 && (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.75rem' }}>หมายเหตุ: {result.caveats.join(', ')}</p>
      )}
    </div>
  );
}

function ErrorBlock({ message, onAnalyze }: { message: string; onAnalyze: () => void }) {
  return (
    <div style={{ fontSize: '0.85rem' }}>
      <p style={{ margin: '0 0 8px 0', color: '#f43f5e' }}>⚠️ AI วิเคราะห์ไม่สำเร็จ: {message}</p>
      <button type="button" onClick={onAnalyze}>
        ลองใหม่
      </button>
    </div>
  );
}

export function AiAnalystPanel({ state, onAnalyze, disabled }: AiAnalystPanelProps) {
  return (
    <div
      className="ai-analyst-panel"
      style={{
        background: 'linear-gradient(180deg, rgba(139,92,246,0.08), rgba(15,23,42,0.4))',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        borderRadius: '12px',
        padding: '16px',
        height: '100%',
      }}
      data-testid="ai-narrative-section"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '1.2rem' }}>🧠</span>
        <strong style={{ fontSize: '0.95rem', color: '#c4b5fd', fontFamily: 'Outfit, sans-serif' }}>AI Analyst</strong>
      </div>
      {state.status === 'idle' && (
        <>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
            มุมมองอิสระจาก Local LLM — อ่านตัวเลขเดียวกันแต่ให้เหตุผลของตัวเอง
          </p>
          <button type="button" onClick={onAnalyze} disabled={disabled} style={{ width: '100%' }}>
            วิเคราะห์ด้วย AI
          </button>
        </>
      )}
      {state.status === 'loading' && <LoadingBlock />}
      {state.status === 'error' && <ErrorBlock message={state.message} onAnalyze={onAnalyze} />}
      {state.status === 'success' && <ResultBody result={state.result} />}
    </div>
  );
}
