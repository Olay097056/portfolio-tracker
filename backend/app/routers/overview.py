"""Overview dashboard router — GET /api/overview + POST /api/overview/brief."""

from fastapi import APIRouter, HTTPException

from app import overview_service

router = APIRouter(prefix="/api/overview", tags=["overview"])


@router.get("")
def get_overview() -> dict:
    return overview_service.build_overview()


@router.post("/brief")
def refresh_brief() -> dict:
    try:
        return overview_service.generate_brief(force=True)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"brief failed: {type(e).__name__}") from e
