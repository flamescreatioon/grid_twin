from datetime import datetime
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.reliability.predictor import predict_reliability


def _severity_from_prediction(item: Dict[str, Any]) -> str:
    if item["risk_band"] == "Critical" or item["outage_probability_pct"] >= 75:
        return "critical"
    if item["risk_band"] == "High" or item["outage_probability_pct"] >= 55:
        return "warning"
    if item["risk_band"] == "Watch" or item["outage_probability_pct"] >= 35:
        return "advisory"
    return "info"


def _alert_title(item: Dict[str, Any]) -> str:
    if item["expected_downtime_hours"] >= 3:
        return "High downtime exposure detected"
    if item["loading_pct"] > 100:
        return "Overload condition may trigger outage"
    if item["historical_outage_count"] >= 2:
        return "Repeated outage pattern detected"
    return "Reliability advisory"


def generate_alerts(db: Session, horizon_days: int = 90, limit: int = 20) -> Dict[str, Any]:
    prediction_report = predict_reliability(db, horizon_days=horizon_days, limit=max(limit, 30))
    alerts: List[Dict[str, Any]] = []

    for item in prediction_report["predictions"]:
        severity = _severity_from_prediction(item)
        if severity == "info":
            continue

        alerts.append({
            "id": f"{item['asset_type']}-{item['asset_id']}-{horizon_days}",
            "severity": severity,
            "category": "downtime_prediction",
            "asset_type": item["asset_type"],
            "asset_id": item["asset_id"],
            "asset_code": item["code"],
            "asset_name": item["name"],
            "title": _alert_title(item),
            "message": (
                f"{item['code']} has a {item['outage_probability_pct']}% outage probability "
                f"over {horizon_days} days with {item['expected_downtime_hours']}h expected downtime."
            ),
            "advice": item["recommended_actions"],
            "likely_cause": item["dominant_cause"],
            "impact": {
                "customers_at_risk": item["customers_at_risk"],
                "expected_downtime_hours": item["expected_downtime_hours"],
                "revenue_at_risk_ngn": item["revenue_at_risk_ngn"],
                "energy_unserved_kwh": item["expected_energy_unserved_kwh"]
            },
            "created_at": prediction_report["generated_at"],
            "status": "open"
        })

    severity_rank = {"critical": 3, "warning": 2, "advisory": 1, "info": 0}
    alerts.sort(
        key=lambda alert: (
            severity_rank.get(alert["severity"], 0),
            alert["impact"]["expected_downtime_hours"],
            alert["impact"]["revenue_at_risk_ngn"]
        ),
        reverse=True
    )

    visible_alerts = alerts[:limit]
    return {
        "generated_at": datetime.utcnow().isoformat(),
        "horizon_days": horizon_days,
        "total_alerts": len(alerts),
        "summary": {
            "critical": sum(1 for alert in alerts if alert["severity"] == "critical"),
            "warning": sum(1 for alert in alerts if alert["severity"] == "warning"),
            "advisory": sum(1 for alert in alerts if alert["severity"] == "advisory"),
            "customers_at_risk": sum(alert["impact"]["customers_at_risk"] for alert in visible_alerts),
            "revenue_at_risk_ngn": round(sum(alert["impact"]["revenue_at_risk_ngn"] for alert in visible_alerts), 2)
        },
        "alerts": visible_alerts
    }
