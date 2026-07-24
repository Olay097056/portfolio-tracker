from fastapi import APIRouter

from app.fx_service import get_usd_to_thb_rate

router = APIRouter(prefix="/fx", tags=["fx"])


@router.get("/usd-thb")
def read_usd_thb_rate():
    return {"usd_thb_rate": get_usd_to_thb_rate()}
