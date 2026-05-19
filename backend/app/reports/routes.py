from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
import io
import csv
from typing import Dict, List, Any

from app.core.database import get_db
from app.auth.routes import get_current_user
from app.auth.models import User
from app.assets import models
from app.risk import scoring
from app.simulations import simulation_engine

router = APIRouter(prefix="/reports", tags=["reports"])

@router.get("/investment-plan")
def get_investment_plan_report(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Generates a prioritized list of capital interventions based on calculated investment scores.
    """
    scenarios = db.query(models.InvestmentScenario).order_by(models.InvestmentScenario.priority_score.desc()).all()
    
    total_cost = sum([s.estimated_cost for s in scenarios])
    total_customers = sum([s.customer_impact for s in scenarios])
    
    return {
        "report_name": "GridTwin AEDC CAPEX Investment Plan",
        "generated_at": models.datetime.utcnow().isoformat(),
        "total_scenarios_evaluated": len(scenarios),
        "total_estimated_capex_ngn": total_cost,
        "total_customers_benefiting": total_customers,
        "scenarios": scenarios
    }

@router.get("/high-risk-assets")
def get_high_risk_assets_report(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Compiles detailed risk and loading profiles for the highest-risk grid nodes.
    """
    # Force recalculation
    scoring.recalculate_all_asset_scores(db)
    
    high_txs = db.query(models.Transformer).filter(models.Transformer.risk_score >= 70.0).all()
    high_fds = db.query(models.Feeder).filter(models.Feeder.risk_score >= 70.0).all()
    
    tx_details = []
    for tx in high_txs:
        breakdown = scoring.calculate_asset_risk(db, "transformer", tx.id)
        tx_details.append({
            "id": tx.id,
            "code": tx.code,
            "name": tx.name,
            "risk_score": tx.risk_score,
            "loading_percentage": tx.loading_percentage,
            "customer_count": tx.customer_count,
            "risk_factors": breakdown.get("breakdown", {})
        })
        
    return {
        "report_name": "High-Risk Asset Warning Report",
        "generated_at": models.datetime.utcnow().isoformat(),
        "high_risk_transformers_count": len(high_txs),
        "high_risk_feeders_count": len(high_fds),
        "transformers": tx_details,
        "feeders": [
            {
                "id": fd.id,
                "code": fd.code,
                "name": fd.name,
                "risk_score": fd.risk_score,
                "peak_load_mw": fd.peak_load_mw
            }
            for fd in high_fds
        ]
    }

@router.get("/outage-impact/{outage_event_id}")
def get_outage_impact_report(outage_event_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Compiles detailed blackout metrics for a past or simulated outage event.
    """
    event = db.query(models.OutageEvent).filter(models.OutageEvent.id == outage_event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Outage event record not found")
        
    duration = (event.outage_end - event.outage_start).total_seconds() / 3600.0 if event.outage_end else 4.0
    
    return {
        "report_name": f"Outage Incident Report #{event.id}",
        "generated_at": models.datetime.utcnow().isoformat(),
        "event_details": {
            "id": event.id,
            "asset_id": event.affected_asset_id,
            "asset_type": event.affected_asset_type,
            "cause": event.cause,
            "outage_start": event.outage_start.isoformat(),
            "outage_end": event.outage_end.isoformat() if event.outage_end else None,
            "duration_hours": round(duration, 1),
            "status": event.status
        },
        "impact_metrics": {
            "customers_affected": event.affected_customers,
            "estimated_energy_lost_kwh": event.estimated_energy_lost,
            "estimated_revenue_lost_ngn": event.estimated_revenue_lost,
            "average_tariff_rate_ngn_kwh": 85.0
        }
    }

@router.get("/export/csv")
def export_assets_csv(asset_type: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Generates a live downloadable CSV spreadsheet containing grid asset parameters.
    """
    output = io.StringIO()
    writer = csv.writer(output)
    
    if asset_type == "substation":
        writer.writerow(["ID", "Name", "Code", "Voltage Level", "Capacity (MVA)", "Status", "Latitude", "Longitude", "District"])
        subs = db.query(models.Substation).all()
        for s in subs:
            writer.writerow([s.id, s.name, s.code, s.voltage_level, s.capacity_mva, s.status, s.latitude, s.longitude, s.district])
    elif asset_type == "feeder":
        writer.writerow(["ID", "Name", "Code", "Voltage Level", "Substation ID", "Peak Load (MW)", "Rated Capacity (MW)", "Risk Score", "Status"])
        feeders = db.query(models.Feeder).all()
        for f in feeders:
            writer.writerow([f.id, f.name, f.code, f.voltage_level, f.source_substation_id, f.peak_load_mw, f.rated_capacity_mw, f.risk_score, f.status])
    elif asset_type == "transformer":
        writer.writerow(["ID", "Name", "Code", "Feeder ID", "Rating (kVA)", "Peak Load (kVA)", "Loading %", "Customer Count", "Risk Score", "Status"])
        txs = db.query(models.Transformer).all()
        for t in txs:
            writer.writerow([t.id, t.name, t.code, t.feeder_id, t.rating_kva, t.peak_load_kva, t.loading_percentage, t.customer_count, t.risk_score, t.status])
    else:
        raise HTTPException(status_code=400, detail="Invalid asset type. Supported: substation, feeder, transformer")
        
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")), 
        media_type="text/csv", 
        headers={"Content-Disposition": f"attachment; filename={asset_type}_registry.csv"}
    )
