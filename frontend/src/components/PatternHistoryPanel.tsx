// frontend/src/components/PatternHistoryPanel.tsx
// wayfinder ticket 01/06 (ai-signal-investor-upgrades map): "has this ticker been in a
// situation like this before?" Renders alongside AiAnalystPanel, fed by usePatternHistory.
import type { PatternHistoryState } from '../hooks/usePatternHistory';

export function PatternHistoryPanel({ state }: { state: PatternHistoryState }) {
  if (state.status === 'idle' || state.status === 'loading') {
    return null; // rides along with the AI narrative call -- its own loading state would be redundant noise while that's already showing "กำลังวิเคราะห์..."
  }

  if (state.status === 'error') {
    return (
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '10px' }} data-testid="pattern-history">
        ดึงข้อมูลสถิติย้อนหลังไม่สำเร็จ
      </div>
    );
  }

  if (state.status === 'not-enough-history') {
    return (
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '10px' }} data-testid="pattern-history">
        ยังไม่มีข้อมูลราคาย้อนหลังพอจะเปรียบเทียบสถิติได้
      </div>
    );
  }

  const r = state.result;
  return (
    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }} data-testid="pattern-history">
      <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>📊 สถิติย้อนหลัง ({r.ticker})</div>
      {r.win_rate !== null ? (
        <div>
          เจอสถานการณ์แบบนี้มาก่อน {r.total_matches} ครั้ง — ชนะ {r.win_count} ครั้ง (เฉลี่ย +{r.avg_win_pct?.toFixed(1)}%), แพ้ {r.loss_count}{' '}
          ครั้ง (เฉลี่ย -{Math.abs(r.avg_loss_pct ?? 0).toFixed(1)}%) — ชนะ {(r.win_rate * 100).toFixed(0)}%
        </div>
      ) : (
        <div>เจอสถานการณ์แบบนี้มาก่อน {r.total_matches} ครั้ง — ยังสะสมข้อมูลไม่พอจะสรุปเป็น % ได้</div>
      )}
      {r.conflict_matches !== null && (
        <div style={{ marginTop: '4px' }}>ในจำนวนนี้ {r.conflict_matches} ครั้งมีสัญญาณขัดแย้งแบบเดียวกับตอนนี้</div>
      )}
    </div>
  );
}
