from datetime import datetime, timedelta
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.assets import models
from app.core.cache import cached
from app.risk import scoring

TARIFF_RATE_NGN_KWH = 85.0
DEFAULT_POWER_FACTOR = 0.85


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _round(value: float, digits: int = 2) -> float:
    return round(float(value or 0.0), digits)


def _outage_events(db: Session, asset_type: str, asset_id: int, months: int = 24) -> List[models.OutageEvent]:
    since = datetime.utcnow() - timedelta(days=30 * months)
    return db.query(models.OutageEvent).filter(
        models.OutageEvent.affected_asset_type == asset_type,
        models.OutageEvent.affected_asset_id == asset_id,
        models.OutageEvent.outage_start >= since
    ).all()


def _duration_hours(event: models.OutageEvent) -> float:
    if event.outage_end:
        return max(0.0, (event.outage_end - event.outage_start).total_seconds() / 3600.0)
    return 4.0


def _maintenance_gap_months(last_maintenance_date) -> float:
    if not last_maintenance_date:
        return 24.0
    return max(0.0, (datetime.utcnow() - last_maintenance_date).days / 30.0)


def _age_years(installation_year) -> float:
    if not installation_year:
        return 12.0
    return max(0.0, datetime.utcnow().year - installation_year)


def _cause_distribution(events: List[models.OutageEvent]) -> Dict[str, int]:
    causes: Dict[str, int] = {}
    for event in events:
        causes[event.cause] = causes.get(event.cause, 0) + 1
    return dict(sorted(causes.items(), key=lambda item: item[1], reverse=True))


def _dominant_cause(asset_type: str, loading_pct: float, maintenance_gap: float, events: List[models.OutageEvent]) -> str:
    causes = _cause_distribution(events)
    if causes:
        return next(iter(causes))
    if loading_pct > 110:
        return "Thermal overload / protection trip"
    if maintenance_gap > 18:
        return "Maintenance gap deterioration"
    if asset_type == "feeder":
        return "Line fault or vegetation/weather exposure"
    return "Fuse, connector, or transformer protection fault"


def _risk_band(score: float) -> str:
    if score >= 75:
        return "Critical"
    if score >= 55:
        return "High"
    if score >= 35:
        return "Watch"
    return "Normal"


def _recommendations(asset_type: str, loading_pct: float, outage_probability: float, maintenance_gap: float) -> List[str]:
    actions = []
    if loading_pct > 100:
        actions.append("Plan load relief or capacity upgrade before the next peak period.")
    elif loading_pct > 90:
        actions.append("Monitor peak loading weekly and prepare a load-transfer option.")
    if maintenance_gap > 18:
        actions.append("Schedule priority inspection and maintenance close-out.")
    if outage_probability > 60:
        actions.append("Prepare crew/material readiness for likely interruption window.")
    if asset_type == "feeder":
        actions.append("Review downstream sectionalizing and backfeed switching options.")
    if not actions:
        actions.append("Keep asset on routine monitoring cycle.")
    return actions


def _transformer_record(db: Session, tx: models.Transformer, horizon_days: int) -> Dict[str, Any]:
    events = _outage_events(db, "transformer", tx.id)
    event_count = len(events)
    total_downtime = sum(_duration_hours(event) for event in events)
    avg_duration = total_downtime / event_count if event_count else 2.5
    annualized_frequency = event_count / 2.0
    maintenance_gap = _maintenance_gap_months(tx.last_maintenance_date)
    age = _age_years(tx.installation_year)

    risk = scoring.calculate_asset_risk(db, "transformer", tx.id).get("risk_score", tx.risk_score or 0.0)
    loading_pct = tx.loading_percentage or 0.0

    probability = (
        0.38 * risk +
        0.25 * _clamp(loading_pct) +
        0.14 * _clamp(annualized_frequency * 20.0) +
        0.13 * _clamp((maintenance_gap / 18.0) * 100.0) +
        0.10 * _clamp((age / 25.0) * 100.0)
    ) * (horizon_days / 90.0) ** 0.35
    probability = _clamp(probability)

    expected_downtime = (probability / 100.0) * max(avg_duration, 1.0)
    affected_kw = tx.peak_load_kva * DEFAULT_POWER_FACTOR
    revenue_at_risk = affected_kw * expected_downtime * TARIFF_RATE_NGN_KWH

    return {
        "asset_type": "transformer",
        "asset_id": tx.id,
        "code": tx.code,
        "name": tx.name,
        "risk_band": _risk_band(probability),
        "outage_probability_pct": _round(probability, 1),
        "expected_downtime_hours": _round(expected_downtime),
        "expected_energy_unserved_kwh": _round(affected_kw * expected_downtime),
        "revenue_at_risk_ngn": _round(revenue_at_risk),
        "customers_at_risk": tx.customer_count,
        "loading_pct": _round(loading_pct, 1),
        "historical_outage_count": event_count,
        "historical_downtime_hours": _round(total_downtime),
        "dominant_cause": _dominant_cause("transformer", loading_pct, maintenance_gap, events),
        "cause_distribution": _cause_distribution(events),
        "drivers": {
            "risk_score": _round(risk, 1),
            "asset_age_years": _round(age, 1),
            "maintenance_gap_months": _round(maintenance_gap, 1),
            "annualized_outage_frequency": _round(annualized_frequency, 2)
        },
        "recommended_actions": _recommendations("transformer", loading_pct, probability, maintenance_gap)
    }


def _feeder_record(db: Session, feeder: models.Feeder, horizon_days: int) -> Dict[str, Any]:
    events = _outage_events(db, "feeder", feeder.id)
    event_count = len(events)
    total_downtime = sum(_duration_hours(event) for event in events)
    avg_duration = total_downtime / event_count if event_count else 3.5
    annualized_frequency = event_count / 2.0
    maintenance_count = db.query(models.MaintenanceRecord).filter(
        models.MaintenanceRecord.asset_id == feeder.id,
        models.MaintenanceRecord.asset_type == "feeder"
    ).count()
    maintenance_gap = 24.0 if maintenance_count == 0 else max(0.0, 18.0 - (maintenance_count * 4.0))
    loading_pct = (feeder.peak_load_mw / feeder.rated_capacity_mw) * 100.0 if feeder.rated_capacity_mw else 0.0
    customers = sum(tx.customer_count for tx in feeder.transformers)

    risk = scoring.calculate_asset_risk(db, "feeder", feeder.id).get("risk_score", feeder.risk_score or 0.0)

    probability = (
        0.34 * risk +
        0.23 * _clamp(loading_pct) +
        0.20 * _clamp(annualized_frequency * 18.0) +
        0.13 * _clamp((maintenance_gap / 18.0) * 100.0) +
        0.10 * _clamp((customers / 1500.0) * 100.0)
    ) * (horizon_days / 90.0) ** 0.35
    probability = _clamp(probability)

    expected_downtime = (probability / 100.0) * max(avg_duration, 1.0)
    affected_kw = feeder.peak_load_mw * 1000.0

    return {
        "asset_type": "feeder",
        "asset_id": feeder.id,
        "code": feeder.code,
        "name": feeder.name,
        "risk_band": _risk_band(probability),
        "outage_probability_pct": _round(probability, 1),
        "expected_downtime_hours": _round(expected_downtime),
        "expected_energy_unserved_kwh": _round(affected_kw * expected_downtime),
        "revenue_at_risk_ngn": _round(affected_kw * expected_downtime * TARIFF_RATE_NGN_KWH),
        "customers_at_risk": customers,
        "loading_pct": _round(loading_pct, 1),
        "historical_outage_count": event_count,
        "historical_downtime_hours": _round(total_downtime),
        "dominant_cause": _dominant_cause("feeder", loading_pct, maintenance_gap, events),
        "cause_distribution": _cause_distribution(events),
        "drivers": {
            "risk_score": _round(risk, 1),
            "maintenance_signal_months": _round(maintenance_gap, 1),
            "annualized_outage_frequency": _round(annualized_frequency, 2),
            "connected_transformers": len(feeder.transformers)
        },
        "recommended_actions": _recommendations("feeder", loading_pct, probability, maintenance_gap)
    }


@cached(ttl_seconds=300, prefix="reliability")
def predict_reliability(db: Session, horizon_days: int = 90, limit: int = 25) -> Dict[str, Any]:
    horizon_days = max(7, min(365, horizon_days))
    records: List[Dict[str, Any]] = []

    for feeder in db.query(models.Feeder).all():
        records.append(_feeder_record(db, feeder, horizon_days))

    for tx in db.query(models.Transformer).all():
        records.append(_transformer_record(db, tx, horizon_days))

    records.sort(key=lambda item: (item["outage_probability_pct"], item["expected_downtime_hours"]), reverse=True)
    top_records = records[:limit]

    return {
        "model_name": "GridTwin Reliability Predictor",
        "model_version": "rule-calibrated-v1",
        "horizon_days": horizon_days,
        "generated_at": datetime.utcnow().isoformat(),
        "asset_count": len(records),
        "summary": {
            "critical_assets": sum(1 for item in records if item["risk_band"] == "Critical"),
            "high_assets": sum(1 for item in records if item["risk_band"] == "High"),
            "expected_downtime_hours": _round(sum(item["expected_downtime_hours"] for item in records)),
            "revenue_at_risk_ngn": _round(sum(item["revenue_at_risk_ngn"] for item in records)),
            "customers_at_risk": sum(item["customers_at_risk"] for item in top_records if item["risk_band"] in ["Critical", "High"])
        },
        "predictions": top_records
    }


def predict_asset_reliability(db: Session, asset_type: str, asset_id: int, horizon_days: int = 90) -> Dict[str, Any]:
    if asset_type == "transformer":
        tx = db.query(models.Transformer).filter(models.Transformer.id == asset_id).first()
        if not tx:
            return {"error": "Transformer not found"}
        return _transformer_record(db, tx, max(7, min(365, horizon_days)))

    if asset_type == "feeder":
        feeder = db.query(models.Feeder).filter(models.Feeder.id == asset_id).first()
        if not feeder:
            return {"error": "Feeder not found"}
        return _feeder_record(db, feeder, max(7, min(365, horizon_days)))

    return {"error": "Reliability prediction supports feeder and transformer assets"}
