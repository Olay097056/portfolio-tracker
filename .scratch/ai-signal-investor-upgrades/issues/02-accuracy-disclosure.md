Type: task
Status: resolved

## Question

Add an honest accuracy disclosure to the confidence-score display in `frontend/src/pages/DashboardPage.tsx`, so it's never presented with more certainty than it's earned.

Use the real numbers already established in the prior map's backtest work (`.scratch/ai-signal-upgrade/issues/08-fit-scoring-model.md` / `backend/app/backtest/results/model_fit_report.md`): the fitted classification model beat a majority-class baseline in 4/5 walk-forward folds, average accuracy 62.7% vs. average baseline 58.5%, AUC range 0.60-0.78 across folds. Don't restate these from memory in the implementation — read the actual report file for the precise numbers to display, and round/phrase them honestly (e.g. "แม่นยำในอดีตประมาณ 60-65%, ไม่ใช่การรับประกัน" — not a single false-precision decimal).

Suggested placement: a small muted-text line directly under the confidence score bar/badge (near `aiSignal.confidenceRating` in `DashboardPage.tsx`), always visible (not hidden behind a tooltip/hover — the point is it shouldn't be missable).

Add a short backend or frontend test asserting the disclosure text renders whenever a confidence score is shown, so a future refactor can't silently drop it.

## Answer

Added a muted-text line under the confidence score bar in `DashboardPage.tsx`, always visible (not a tooltip): "แม่นยำในอดีตประมาณ 62-63% (ดีกว่าการเดาแบบหยาบที่ ~58-59% เล็กน้อย, วัดจาก backtest 5 ปี) — ไม่ใช่การรับประกันผลในอนาคต". Numbers read directly from `backend/app/backtest/results/model_fit_report.md` (ticket 08's walk-forward classification result), not restated from memory: avg accuracy 0.6274 vs avg majority-class baseline 0.5847, beat baseline in 4/5 folds, AUC 0.5996-0.7835 (rounded to 60-78% range in the wording, though the displayed line leads with the accuracy comparison as the more intuitive number).

Test added to `DashboardPage.test.tsx` asserting the disclosure text renders whenever the confidence score does — 29/29 tests passing (was 28).

