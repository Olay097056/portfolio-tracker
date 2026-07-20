from typing import TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

ModelT = TypeVar("ModelT")


def get_or_404(db: Session, model: type[ModelT], entity_id: int, not_found_detail: str) -> ModelT:
    entity = db.get(model, entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=not_found_detail)
    return entity
