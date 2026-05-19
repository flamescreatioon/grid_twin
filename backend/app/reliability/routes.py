from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.routes import get_current_user, require_role
from app.core.database import get_db
from app.reliability import predictor

router = APIRouter(prefix="/reliability", tags=["reliability"])


@router.get("/predictions")
def get_reliability_predictions(
    horizon_days: int = 90,
    limit: int = 25,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER", "OPERATIONS_ENGINEER", "MANAGER"]))
):
    return predictor.predict_reliability(db, horizon_days=horizon_days, limit=limit)


@router.get("/{asset_type}/{asset_id}")
def get_asset_reliability_prediction(
    asset_type: str,
    asset_id: int,
    horizon_days: int = 90,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = predictor.predict_asset_reliability(db, asset_type, asset_id, horizon_days=horizon_days)
    if "error" in result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=result["error"])
    return result
