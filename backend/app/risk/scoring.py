from sqlalchemy.orm import Session
from app.assets import models
from datetime import datetime
from typing import Dict, Any, List

def calculate_asset_risk(db: Session, asset_type: str, asset_id: int) -> Dict[str, Any]:
    """
    Computes explainable risk score (0-100) using the utility engineering rules:
    Asset Risk Score =
      0.25*(Load Stress)
      + 0.20*(Fault History)
      + 0.15*(Asset Age)
      + 0.15*(Maintenance Gap)
      + 0.10*(Customer Impact)
      + 0.10*(Demand Growth)
      + 0.05*(Environmental Stress)
    """
    current_year = datetime.utcnow().year
    
    # Initialize components
    load_stress = 0.0
    fault_history_score = 0.0
    asset_age_score = 0.0
    maintenance_gap_score = 0.0
    customer_impact_score = 0.0
    demand_growth_score = 50.0  # baseline growth rate risk (50/100)
    environmental_score = 30.0   # baseline environmental risk (30/100)
    
    if asset_type == "transformer":
        tx = db.query(models.Transformer).filter(models.Transformer.id == asset_id).first()
        if not tx:
            return {"error": "Transformer not found"}
            
        # 1. Load Stress (based on loading percentage)
        load_stress = min(100.0, tx.loading_percentage)
        
        # 2. Fault History (from outage events)
        fault_count = db.query(models.OutageEvent).filter(
            models.OutageEvent.affected_asset_id == tx.id,
            models.OutageEvent.affected_asset_type == "transformer"
        ).count()
        fault_history_score = min(100.0, fault_count * 25.0)  # 4 faults caps at 100%
        
        # 3. Asset Age (from installation year)
        if tx.installation_year:
            age = max(0, current_year - tx.installation_year)
            asset_age_score = min(100.0, (age / 25.0) * 100.0)  # 25 years caps at 100%
        else:
            asset_age_score = 40.0  # default assumption if missing
            
        # 4. Maintenance Gap (time since last maintenance)
        if tx.last_maintenance_date:
            days = (datetime.utcnow() - tx.last_maintenance_date).days
            months = max(0, days / 30.0)
            maintenance_gap_score = min(100.0, (months / 18.0) * 100.0)  # 18 months gap is 100% risk
        else:
            maintenance_gap_score = 80.0  # high risk if never maintained
            
        # 5. Customer Impact (based on customer count)
        # Assume 150 customers is standard, 300+ is high impact
        customer_impact_score = min(100.0, (tx.customer_count / 200.0) * 100.0)
        
    elif asset_type == "feeder":
        feeder = db.query(models.Feeder).filter(models.Feeder.id == asset_id).first()
        if not feeder:
            return {"error": "Feeder not found"}
            
        # 1. Load Stress
        loading_pct = (feeder.peak_load_mw / feeder.rated_capacity_mw) * 100.0 if feeder.rated_capacity_mw > 0 else 0.0
        load_stress = min(100.0, loading_pct)
        
        # 2. Fault History
        fault_count = db.query(models.OutageEvent).filter(
            models.OutageEvent.affected_asset_id == feeder.id,
            models.OutageEvent.affected_asset_type == "feeder"
        ).count()
        fault_history_score = min(100.0, fault_count * 20.0)
        
        # 3. Asset Age (Feeders: default age profile based on connected transformers)
        asset_age_score = 50.0  # typical network standard
        
        # 4. Maintenance Gap
        maint_count = db.query(models.MaintenanceRecord).filter(
            models.MaintenanceRecord.asset_id == feeder.id,
            models.MaintenanceRecord.asset_type == "feeder"
        ).count()
        maintenance_gap_score = max(0.0, 100.0 - (maint_count * 30.0))  # 3+ actions reduces gap risk to 10%
        
        # 5. Customer Impact (sum of customers on connected transformers)
        total_customers = sum([tx.customer_count for tx in feeder.transformers])
        customer_impact_score = min(100.0, (total_customers / 1500.0) * 100.0)  # 1500 customers caps at 100%
        
    else:
        return {"error": "Unsupported asset type for risk scoring"}
        
    # Aggregate weighted score
    aggregate_score = (
        0.25 * load_stress +
        0.20 * fault_history_score +
        0.15 * asset_age_score +
        0.15 * maintenance_gap_score +
        0.10 * customer_impact_score +
        0.10 * demand_growth_score +
        0.05 * environmental_score
    )
    
    aggregate_score = round(aggregate_score, 1)
    
    return {
        "asset_type": asset_type,
        "asset_id": asset_id,
        "risk_score": aggregate_score,
        "breakdown": {
            "load_stress": round(load_stress, 1),
            "fault_history": round(fault_history_score, 1),
            "asset_age": round(asset_age_score, 1),
            "maintenance_gap": round(maintenance_gap_score, 1),
            "customer_impact": round(customer_impact_score, 1),
            "demand_growth": round(demand_growth_score, 1),
            "environmental_stress": round(environmental_score, 1)
        }
    }

def recalculate_all_asset_scores(db: Session) -> Dict[str, int]:
    """
    Recalculates risk scores for all feeders and transformers and saves them.
    """
    transformers = db.query(models.Transformer).all()
    feeders = db.query(models.Feeder).all()
    
    tx_count = 0
    fd_count = 0
    
    for tx in transformers:
        risk_data = calculate_asset_risk(db, "transformer", tx.id)
        if "risk_score" in risk_data:
            tx.risk_score = risk_data["risk_score"]
            tx_count += 1
            
    for fd in feeders:
        risk_data = calculate_asset_risk(db, "feeder", fd.id)
        if "risk_score" in risk_data:
            fd.risk_score = risk_data["risk_score"]
            fd_count += 1
            
    db.commit()
    return {"transformers_recalculated": tx_count, "feeders_recalculated": fd_count}
