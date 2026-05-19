from sqlalchemy.orm import Session
from app.assets import models
from app.topology import graph_builder
from typing import Dict, List, Any

# Static weights and constants for calculations
TARIFF_RATE_NGN_KWH = 85.0  # Estimated average AEDC tariff in Naira per kWh
DEFAULT_OUTAGE_HOURS = 4.0
DEFAULT_POWER_FACTOR = 0.85
FEEDER_WARNING_THRESHOLD = 90.0
OVERLOAD_THRESHOLD = 100.0

def _round(value: float, digits: int = 2) -> float:
    return round(float(value or 0.0), digits)

def _load_diversity_factor(customer_count: int) -> float:
    """
    Estimate coincident demand for an added customer group.
    Smaller clusters are closer to full coincidence; larger groups diversify.
    """
    if customer_count <= 0:
        return 1.0
    if customer_count < 20:
        return 0.95
    if customer_count < 75:
        return 0.85
    if customer_count < 200:
        return 0.78
    return 0.72

def _safe_pct(numerator: float, denominator: float) -> float:
    return (numerator / denominator) * 100.0 if denominator and denominator > 0 else 0.0

def _reserve_margin_pct(loading_percentage: float) -> float:
    return 100.0 - loading_percentage

def calculate_loading_status(loading_percentage: float) -> str:
    """
    Classifies loading based on AEDC criteria:
    0–70% = Healthy
    71–90% = Watch
    91–100% = Near Limit
    101–120% = Overloaded
    Above 120% = Critical
    """
    if loading_percentage <= 70.0:
        return "Healthy"
    elif loading_percentage <= 90.0:
        return "Watch"
    elif loading_percentage <= 100.0:
        return "Near Limit"
    elif loading_percentage <= 120.0:
        return "Overloaded"
    else:
        return "Critical"

def run_outage_simulation(db: Session, asset_type: str, asset_id: int, hours: float = DEFAULT_OUTAGE_HOURS) -> Dict[str, Any]:
    """
    Simulates the grid and revenue impact of an outage on a given asset type (substation, feeder, or transformer).
    """
    G = graph_builder.build_network_graph(db)
    start_node = f"{asset_type}_{asset_id}"
    
    if not G.has_node(start_node):
        return {"error": f"Asset {asset_type} with ID {asset_id} not found in topology graph."}
        
    # Trace all downstream nodes affected by this outage
    downstream_nodes = graph_builder.get_downstream_nodes(G, asset_type, asset_id)
    
    # Track affected nodes by type
    affected_substations = []
    affected_feeders = []
    affected_transformers = []
    affected_clusters = []
    
    total_customers = 0
    total_load_kw = 0.0
    
    # Process each affected node. Cluster demand is preferred; transformer peak is
    # used as a fallback when a transformer has no cluster records yet.
    transformer_ids_with_clusters = set()
    for node in downstream_nodes:
        n_type = node["type"]
        n_id = node["id"]
        
        if n_type == "substation":
            affected_substations.append(n_id)
        elif n_type == "feeder":
            affected_feeders.append(n_id)
        elif n_type == "transformer":
            affected_transformers.append(n_id)
            total_customers += node.get("customer_count", 0)
        elif n_type == "customer_cluster":
            affected_clusters.append(n_id)
            transformer_node = next(
                (
                    parent
                    for parent, child in G.in_edges(node["node_id"])
                    if G.nodes[parent].get("type") == "transformer"
                ),
                None
            )
            if transformer_node:
                transformer_ids_with_clusters.add(G.nodes[transformer_node]["id"])
            total_load_kw += node.get("estimated_demand_kw", 0.0)

    for tx_id in affected_transformers:
        if tx_id in transformer_ids_with_clusters:
            continue
        tx = db.query(models.Transformer).filter(models.Transformer.id == tx_id).first()
        if tx:
            total_load_kw += tx.peak_load_kva * DEFAULT_POWER_FACTOR
            
    # Calculate impacts
    energy_lost_kwh = total_load_kw * hours
    revenue_lost_ngn = energy_lost_kwh * TARIFF_RATE_NGN_KWH
    customer_hours_interrupted = total_customers * hours
    outage_severity_index = (customer_hours_interrupted * 0.6) + (energy_lost_kwh * 0.4)
    
    # Determine restoration priority based on size of load and customer base
    restoration_score = (total_customers * 0.35) + (total_load_kw * 0.45) + (hours * 20.0)
    if restoration_score > 500:
        priority = "P1 - Critical"
    elif restoration_score > 150:
        priority = "P2 - High"
    elif restoration_score > 50:
        priority = "P3 - Medium"
    else:
        priority = "P4 - Low"
        
    # Generate database record for this simulated outage (or just return report)
    sim_report = {
        "asset_type": asset_type,
        "asset_id": asset_id,
        "affected_substations_count": len(affected_substations),
        "affected_feeders_count": len(affected_feeders),
        "affected_transformers_count": len(affected_transformers),
        "affected_customer_clusters_count": len(affected_clusters),
        "total_affected_customers": total_customers,
        "total_affected_load_kw": _round(total_load_kw),
        "estimated_energy_lost_kwh": _round(energy_lost_kwh),
        "estimated_revenue_lost_ngn": _round(revenue_lost_ngn),
        "outage_duration_hours": hours,
        "customer_hours_interrupted": _round(customer_hours_interrupted),
        "outage_severity_index": _round(outage_severity_index),
        "average_kw_per_customer": _round(total_load_kw / total_customers, 3) if total_customers else 0.0,
        "restoration_priority": priority,
        "restoration_score": _round(restoration_score),
        "assumptions": {
            "tariff_rate_ngn_kwh": TARIFF_RATE_NGN_KWH,
            "power_factor": DEFAULT_POWER_FACTOR,
            "topology_model": "radial_downstream_trace"
        },
        "affected_asset_ids": {
            "substations": affected_substations,
            "feeders": affected_feeders,
            "transformers": affected_transformers,
            "customer_clusters": affected_clusters
        }
    }
    
    return sim_report

def run_load_growth_simulation(db: Session, annual_growth_rate: float, years: int) -> Dict[str, Any]:
    """
    Simulates demand growth across all transformers and feeders over N years,
    identifying which assets will become overloaded or critical.
    """
    transformers = db.query(models.Transformer).all()
    compounded_factor = (1 + (annual_growth_rate / 100.0)) ** years
    
    new_overloaded_txs = []
    new_critical_txs = []
    tx_results = []
    feeder_growth: Dict[int, Dict[str, Any]] = {}
    
    for tx in transformers:
        projected_load = tx.peak_load_kva * compounded_factor
        projected_loading_pct = _safe_pct(projected_load, tx.rating_kva)
        projected_status = calculate_loading_status(projected_loading_pct)
        
        current_status = calculate_loading_status(tx.loading_percentage)
        
        result = {
            "id": tx.id,
            "code": tx.code,
            "name": tx.name,
            "current_load_kva": tx.peak_load_kva,
            "projected_load_kva": projected_load,
            "current_loading_pct": tx.loading_percentage,
            "projected_loading_pct": _round(projected_loading_pct),
            "current_status": current_status,
            "projected_status": projected_status,
            "reserve_margin_pct": _round(_reserve_margin_pct(projected_loading_pct)),
            "incremental_load_kva": _round(projected_load - tx.peak_load_kva)
        }
        
        if projected_status == "Overloaded" and current_status not in ["Overloaded", "Critical"]:
            new_overloaded_txs.append(result)
        elif projected_status == "Critical" and current_status != "Critical":
            new_critical_txs.append(result)
            
        tx_results.append(result)

        feeder_data = feeder_growth.setdefault(
            tx.feeder_id,
            {
                "current_transformer_peak_kva": 0.0,
                "projected_transformer_peak_kva": 0.0,
                "transformer_count": 0,
            },
        )
        feeder_data["current_transformer_peak_kva"] += tx.peak_load_kva
        feeder_data["projected_transformer_peak_kva"] += projected_load
        feeder_data["transformer_count"] += 1

    feeder_results = []
    for feeder in db.query(models.Feeder).all():
        growth = feeder_growth.get(feeder.id, {})
        current_connected_mw = (growth.get("current_transformer_peak_kva", 0.0) * DEFAULT_POWER_FACTOR) / 1000.0
        projected_connected_mw = (growth.get("projected_transformer_peak_kva", 0.0) * DEFAULT_POWER_FACTOR) / 1000.0
        current_feeder_mw = max(feeder.peak_load_mw, current_connected_mw)
        projected_feeder_mw = max(feeder.peak_load_mw * compounded_factor, projected_connected_mw)
        projected_loading_pct = _safe_pct(projected_feeder_mw, feeder.rated_capacity_mw)
        feeder_results.append({
            "id": feeder.id,
            "code": feeder.code,
            "name": feeder.name,
            "rated_capacity_mw": feeder.rated_capacity_mw,
            "current_peak_mw": _round(current_feeder_mw),
            "projected_peak_mw": _round(projected_feeder_mw),
            "projected_loading_pct": _round(projected_loading_pct),
            "reserve_margin_mw": _round(feeder.rated_capacity_mw - projected_feeder_mw),
            "projected_status": calculate_loading_status(projected_loading_pct),
            "is_overloaded_after": projected_loading_pct > OVERLOAD_THRESHOLD,
            "is_warning_after": projected_loading_pct > FEEDER_WARNING_THRESHOLD
        })
        
    return {
        "growth_rate_pct": annual_growth_rate,
        "years": years,
        "load_compounding_multiplier": _round(compounded_factor, 4),
        "total_transformers_evaluated": len(transformers),
        "new_overloaded_transformers": new_overloaded_txs,
        "new_critical_transformers": new_critical_txs,
        "feeder_impacts": feeder_results,
        "overloaded_feeders": [f for f in feeder_results if f["is_overloaded_after"]],
        "all_transformers": tx_results
    }

def run_new_connection_simulation(
    db: Session,
    transformer_id: int,
    new_demand_kw: float,
    customer_count: int = 0
) -> Dict[str, Any]:
    """
    Evaluates the capacity impact on a transformer and its parent feeder from adding a new load cluster.
    """
    tx = db.query(models.Transformer).filter(models.Transformer.id == transformer_id).first()
    if not tx:
        return {"error": f"Transformer {transformer_id} not found"}
        
    feeder = db.query(models.Feeder).filter(models.Feeder.id == tx.feeder_id).first()
    
    diversity_factor = _load_diversity_factor(customer_count)
    diversified_kw = new_demand_kw * diversity_factor
    new_demand_kva = diversified_kw / DEFAULT_POWER_FACTOR
    
    current_tx_load_kva = tx.peak_load_kva
    projected_tx_load_kva = current_tx_load_kva + new_demand_kva
    projected_tx_loading_pct = _safe_pct(projected_tx_load_kva, tx.rating_kva)
    projected_tx_status = calculate_loading_status(projected_tx_loading_pct)
    
    result = {
        "transformer": {
            "id": tx.id,
            "code": tx.code,
            "name": tx.name,
            "rating_kva": tx.rating_kva,
            "current_load_kva": _round(current_tx_load_kva),
            "projected_load_kva": _round(projected_tx_load_kva),
            "current_loading_pct": tx.loading_percentage,
            "projected_loading_pct": _round(projected_tx_loading_pct),
            "reserve_margin_kva": _round(tx.rating_kva - projected_tx_load_kva),
            "reserve_margin_pct": _round(_reserve_margin_pct(projected_tx_loading_pct)),
            "current_status": calculate_loading_status(tx.loading_percentage),
            "projected_status": projected_tx_status,
            "is_overloaded_after": projected_tx_loading_pct > OVERLOAD_THRESHOLD
        },
        "new_load": {
            "submitted_kw": _round(new_demand_kw),
            "diversified_kw": _round(diversified_kw),
            "diversity_factor": diversity_factor,
            "power_factor": DEFAULT_POWER_FACTOR,
            "equivalent_kva": _round(new_demand_kva),
            "customer_count": customer_count
        },
        "recommendation": "approve"
    }
    
    if feeder:
        # Convert feeder peak load MW and capacity MW
        # New load in MW = new_demand_kw / 1000.0
        new_demand_mw = diversified_kw / 1000.0
        current_feeder_load_mw = feeder.peak_load_mw
        projected_feeder_load_mw = current_feeder_load_mw + new_demand_mw
        current_feeder_loading_pct = _safe_pct(current_feeder_load_mw, feeder.rated_capacity_mw)
        projected_feeder_loading_pct = _safe_pct(projected_feeder_load_mw, feeder.rated_capacity_mw)
        
        result["feeder"] = {
            "id": feeder.id,
            "code": feeder.code,
            "name": feeder.name,
            "capacity_mw": feeder.rated_capacity_mw,
            "current_load_mw": _round(current_feeder_load_mw),
            "projected_load_mw": _round(projected_feeder_load_mw),
            "current_loading_pct": _round(current_feeder_loading_pct),
            "projected_loading_pct": _round(projected_feeder_loading_pct),
            "reserve_margin_mw": _round(feeder.rated_capacity_mw - projected_feeder_load_mw),
            "current_status": calculate_loading_status(current_feeder_loading_pct),
            "projected_status": calculate_loading_status(projected_feeder_loading_pct),
            "is_overloaded_after": projected_feeder_loading_pct > OVERLOAD_THRESHOLD
        }

    tx_overloaded = result["transformer"]["is_overloaded_after"]
    feeder_overloaded = result.get("feeder", {}).get("is_overloaded_after", False)
    if tx_overloaded or feeder_overloaded:
        result["recommendation"] = "reject_or_reinforce"
    elif result["transformer"]["projected_loading_pct"] > FEEDER_WARNING_THRESHOLD or result.get("feeder", {}).get("projected_loading_pct", 0) > FEEDER_WARNING_THRESHOLD:
        result["recommendation"] = "approve_with_monitoring"
        
    return result

def run_upgrade_simulation(db: Session, transformer_id: int, new_capacity_kva: float) -> Dict[str, Any]:
    tx = db.query(models.Transformer).filter(models.Transformer.id == transformer_id).first()
    if not tx:
        return {"error": "Transformer not found"}
    if new_capacity_kva <= 0:
        return {"error": "New transformer capacity must be greater than zero"}

    current_loading = tx.loading_percentage
    current_status = calculate_loading_status(current_loading)
    projected_loading = _safe_pct(tx.peak_load_kva, new_capacity_kva)
    projected_status = calculate_loading_status(projected_loading)
    loading_reduction = current_loading - projected_loading

    return {
        "transformer_id": tx.id,
        "code": tx.code,
        "name": tx.name,
        "current_rating_kva": tx.rating_kva,
        "proposed_rating_kva": new_capacity_kva,
        "current_peak_load_kva": tx.peak_load_kva,
        "current_loading_pct": _round(current_loading),
        "proposed_loading_pct": _round(projected_loading),
        "loading_reduction_pct": _round(loading_reduction),
        "added_capacity_kva": _round(new_capacity_kva - tx.rating_kva),
        "reserve_margin_kva": _round(new_capacity_kva - tx.peak_load_kva),
        "current_status": current_status,
        "proposed_status": projected_status,
        "is_relieved": projected_loading <= FEEDER_WARNING_THRESHOLD,
        "recommendation": "upgrade_recommended" if current_loading > FEEDER_WARNING_THRESHOLD and projected_loading <= FEEDER_WARNING_THRESHOLD else "review_capacity_choice"
    }

def calculate_priority_score(
    risk_reduction: float,         # normalized 0-100
    customer_impact: float,        # normalized 0-100
    cost_effectiveness: float,     # normalized 0-100 (higher = more cost effective, i.e., lower cost per benefit)
    reliability_improvement: float,# normalized 0-100
    implementation_speed: float,   # normalized 0-100 (higher = faster)
    revenue_protection: float      # normalized 0-100
) -> float:
    """
    Weighted ranking formula:
    Asset risk reduction: 25%
    Customer impact: 20%
    Cost effectiveness: 20%
    Reliability improvement: 15%
    Implementation speed: 10%
    Revenue protection: 10%
    """
    score = (
        0.25 * risk_reduction +
        0.20 * customer_impact +
        0.20 * cost_effectiveness +
        0.15 * reliability_improvement +
        0.10 * implementation_speed +
        0.10 * revenue_protection
    )
    return round(score, 2)
