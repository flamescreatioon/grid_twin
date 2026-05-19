from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.alerts.engine import generate_alerts
from app.auth.models import User
from app.auth.routes import require_role
from app.core.database import get_db

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
def get_alerts(
    horizon_days: int = 90,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER", "OPERATIONS_ENGINEER", "MANAGER"]))
):
    return generate_alerts(db, horizon_days=horizon_days, limit=limit)
