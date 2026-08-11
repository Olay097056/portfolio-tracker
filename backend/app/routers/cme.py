"""CME zone router — GET /api/cme."""

from fastapi import APIRouter

from app import cme_service

router = APIRouter(prefix="/api/cme", tags=["cme"])


@router.get("")
def get_cme() -> dict:
    return cme_service.build_cme()
