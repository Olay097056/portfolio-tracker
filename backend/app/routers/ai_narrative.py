# backend/app/routers/ai_narrative.py
from fastapi import APIRouter, HTTPException

from app.ai_narrative_service import AiNarrativeError, get_ai_narrative
from app.backtest.per_ticker_lookup import lookup_pattern_history
from app.schemas import AiNarrativeOut, AiNarrativeRequest, PatternHistoryOut

router = APIRouter(prefix="/ai-narrative", tags=["ai-narrative"])


@router.post("/analyze", response_model=AiNarrativeOut)
def analyze(payload: AiNarrativeRequest):
    try:
        return get_ai_narrative(payload.ticker, payload.metrics)
    except AiNarrativeError as e:
        # 503, not 500: this is Ollama being unreachable/slow/wrong, not a bug in our own code —
        # the frontend renders this as "AI วิเคราะห์ไม่สำเร็จ" + a retry button (ticket 04's
        # fallback decision), never a silent hide and never a fabricated fallback narrative.
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.get("/pattern-history", response_model=PatternHistoryOut | None)
def pattern_history(ticker: str, signal_type: str, has_conflict: bool = False):
    """Separate from /analyze (ticket 06) so this deterministic, fast (~1s) lookup keeps working
    even when Ollama is slow/unreachable -- it doesn't depend on the LLM call at all. Returns
    null (not an error) when there isn't enough history to evaluate (e.g. a very recent IPO) --
    the frontend renders that as its own "not enough history" state, distinct from a low
    resolved_count (which the payload itself signals via win_rate being null)."""
    return lookup_pattern_history(ticker.strip().upper(), signal_type, has_conflict)
