from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from datetime import datetime, timedelta
from app.core.database import get_db
from app.auth.routes import get_current_user, require_role
from app.auth.models import User
from app.simulations import simulation_engine
from app.assets import models

router = APIRouter(prefix="/simulate", tags=["simulations"])

# --- Request Models ---
class OutageRequest(BaseModel):
    asset_type: str  # substation, feeder, transformer
    asset_id: int
    duration_hours: Optional[float] = 4.0

class LoadGrowthRequest(BaseModel):
    annual_growth_rate: float
    years: int

class NewConnectionRequest(BaseModel):
    transformer_id: int
    new_demand_kw: float
    customer_count: Optional[int] = 0

class UpgradeRequest(BaseModel):
    transformer_id: int
    new_capacity_kva: float

class InvestmentScenarioRequest(BaseModel):
    name: str
    scenario_type: str
    target_asset_id: int
    target_asset_type: str
    estimated_cost: float
    expected_benefit: Optional[str] = None
    risk_reduction: float  # 0 to 100
    customer_impact: int   # number of customers affected
    reliability_improvement: float  # 0 to 100
    revenue_protection: float  # expected savings/month
    implementation_time_days: int


# --- Endpoints ---
@router.post("/outage")
def simulate_outage(payload: OutageRequest, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER", "OPERATIONS_ENGINEER"]))):
    """
    Simulates the impact of an outage on a substation, feeder, or transformer.
    """
    if payload.asset_type not in ["substation", "feeder", "transformer"]:
        raise HTTPException(status_code=400, detail="Invalid asset type for outage simulation")
        
    result = simulation_engine.run_outage_simulation(
        db, payload.asset_type, payload.asset_id, payload.duration_hours
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
        
    # Log this as an outage event in the DB
    db_outage = models.OutageEvent(
        affected_asset_id=payload.asset_id,
        affected_asset_type=payload.asset_type,
        outage_start=datetime.utcnow(),
        outage_end=datetime.utcnow() + timedelta(hours=payload.duration_hours),
        cause="Simulated outage",
        affected_customers=result["total_affected_customers"],
        estimated_energy_lost=result["estimated_energy_lost_kwh"],
        estimated_revenue_lost=result["estimated_revenue_lost_ngn"],
        status="resolved"
    )
    db.add(db_outage)
    db.commit()
    
    return result

@router.post("/load-growth")
def simulate_load_growth(payload: LoadGrowthRequest, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER", "OPERATIONS_ENGINEER"]))):
    """
    Simulates network load growth compounding over multiple years.
    """
    if payload.years <= 0 or payload.years > 50:
        raise HTTPException(status_code=400, detail="Years must be between 1 and 50")
    if payload.annual_growth_rate < -50 or payload.annual_growth_rate > 100:
        raise HTTPException(status_code=400, detail="Annual growth rate must be reasonable")
        
    return simulation_engine.run_load_growth_simulation(
        db, payload.annual_growth_rate, payload.years
    )

@router.post("/new-connection")
def simulate_new_connection(payload: NewConnectionRequest, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER", "OPERATIONS_ENGINEER"]))):
    """
    Simulates adding a new customer cluster of a specific size to a transformer.
    """
    result = simulation_engine.run_new_connection_simulation(
        db, payload.transformer_id, payload.new_demand_kw, payload.customer_count or 0
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@router.post("/upgrade")
def simulate_upgrade(payload: UpgradeRequest, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER", "OPERATIONS_ENGINEER"]))):
    """
    Simulates upgrading a transformer to a larger capacity rating and shows loading improvements.
    """
    result = simulation_engine.run_upgrade_simulation(
        db, payload.transformer_id, payload.new_capacity_kva
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@router.post("/investment-scenario")
def create_investment_scenario(payload: InvestmentScenarioRequest, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER", "MANAGER"]))):
    """
    Saves an investment proposal and calculates its Priority Score using the weighted utility formula.
    """
    # 1. Normalize each parameter to a 0-100 scale for priority score calculation
    # Cost Effectiveness: assume a reference scale where NGN 10 million is standard (lower cost is better)
    # Let's say cost effectiveness = 100 * (1.0 / (1.0 + cost/10_000_000))
    cost_eff = 100.0 * (1.0 / (1.0 + payload.estimated_cost / 15_000_000.0))
    
    # Customer impact: let's normalize, e.g., 500 customers is 100% impact score
    cust_score = min(100.0, (payload.customer_impact / 500.0) * 100.0)
    
    # Implementation speed: lower days is better. Let's say 180 days is standard.
    # speed_score = 100 * (1.0 / (1.0 + days/90.0))
    speed_score = 100.0 * (1.0 / (1.0 + payload.implementation_time_days / 90.0))
    
    # Revenue protection: assume NGN 500k/month is 100%
    rev_score = min(100.0, (payload.revenue_protection / 500_000.0) * 100.0)
    
    # Compute weighted priority index
    priority_score = simulation_engine.calculate_priority_score(
        risk_reduction=payload.risk_reduction,
        customer_impact=cust_score,
        cost_effectiveness=cost_eff,
        reliability_improvement=payload.reliability_improvement,
        implementation_speed=speed_score,
        revenue_protection=rev_score
    )
    
    # 2. Save scenario to DB
    db_scenario = models.InvestmentScenario(
        name=payload.name,
        scenario_type=payload.scenario_type,
        target_asset_id=payload.target_asset_id,
        target_asset_type=payload.target_asset_type,
        estimated_cost=payload.estimated_cost,
        expected_benefit=payload.expected_benefit,
        risk_reduction=payload.risk_reduction,
        customer_impact=payload.customer_impact,
        reliability_improvement=payload.reliability_improvement,
        revenue_protection=payload.revenue_protection,
        implementation_time_days=payload.implementation_time_days,
        priority_score=priority_score,
        created_by=current_user.id
    )
    db.add(db_scenario)
    db.commit()
    db.refresh(db_scenario)
    
    return db_scenario

@router.get("/jobs/{job_id}")
def get_job_status(job_id: str):
    """
    Mock job retrieval endpoint for asynchronous task compliance.
    """
    return {
        "job_id": job_id,
        "status": "completed",
        "progress": 100,
        "completed_at": datetime.utcnow().isoformat()
    }
