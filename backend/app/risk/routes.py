from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.auth.routes import get_current_user, require_role
from app.auth.models import User
from app.risk import scoring
from app.assets import models

router = APIRouter(prefix="/risk", tags=["risk"])

@router.post("/recalculate")
def recalculate_risk_scores(db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER"]))):
    """
    Triggers risk score recalculations for all feeders and transformers in the registry.
    """
    res = scoring.recalculate_all_asset_scores(db)
    return {
        "status": "success",
        "message": "Risk scores updated across the distribution network.",
        "details": res
    }

@router.get("/assets")
def get_asset_risk_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Get a flat list of all active assets and their corresponding risk scores.
    """
    transformers = db.query(models.Transformer).all()
    feeders = db.query(models.Feeder).all()
    
    tx_list = [{"id": tx.id, "code": tx.code, "name": tx.name, "type": "transformer", "risk_score": tx.risk_score} for tx in transformers]
    fd_list = [{"id": fd.id, "code": fd.code, "name": fd.name, "type": "feeder", "risk_score": fd.risk_score} for fd in feeders]
    
    return {
        "transformers": tx_list,
        "feeders": fd_list
    }

@router.get("/feeders")
def get_feeder_risk_scores(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Returns full risk explanation details for all feeders.
    """
    feeders = db.query(models.Feeder).all()
    results = []
    for fd in feeders:
        risk_details = scoring.calculate_asset_risk(db, "feeder", fd.id)
        if "error" not in risk_details:
            results.append(risk_details)
    return results

@router.get("/transformers")
def get_transformer_risk_scores(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Returns full risk explanation details for all transformers.
    """
    transformers = db.query(models.Transformer).all()
    results = []
    for tx in transformers:
        risk_details = scoring.calculate_asset_risk(db, "transformer", tx.id)
        if "error" not in risk_details:
            results.append(risk_details)
    return results

@router.get("/high-risk")
def get_high_risk_assets(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Retrieves assets flagged as high-risk (aggregate score >= 70.0) which require planning attention.
    """
    # Recalculate first to ensure accuracy
    scoring.recalculate_all_asset_scores(db)
    
    high_txs = db.query(models.Transformer).filter(models.Transformer.risk_score >= 70.0).all()
    high_fds = db.query(models.Feeder).filter(models.Feeder.risk_score >= 70.0).all()
    
    return {
        "transformers": [
            {
                "id": tx.id,
                "code": tx.code,
                "name": tx.name,
                "risk_score": tx.risk_score,
                "loading_pct": tx.loading_percentage,
                "customer_count": tx.customer_count,
                "status": tx.status
            } 
            for tx in high_txs
        ],
        "feeders": [
            {
                "id": fd.id,
                "code": fd.code,
                "name": fd.name,
                "risk_score": fd.risk_score,
                "peak_load_mw": fd.peak_load_mw,
                "rated_capacity_mw": fd.rated_capacity_mw
            } 
            for fd in high_fds
        ]
    }
