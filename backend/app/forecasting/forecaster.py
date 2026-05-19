import numpy as np
from datetime import datetime
from sqlalchemy.orm import Session
from app.assets import models
from app.core.cache import cached
from typing import Dict, List, Any, Tuple

DEFAULT_MONTHLY_GROWTH = 0.005
MIN_HISTORY_POINTS_FOR_TREND = 3
SEASONAL_FACTORS = [1.1, 1.15, 1.2, 1.0, 0.9, 0.85, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05]

def _month_start(dt: datetime) -> datetime:
    return datetime(dt.year, dt.month, 1)

def _add_months(dt: datetime, months: int) -> datetime:
    year = dt.year + ((dt.month - 1 + months) // 12)
    month = ((dt.month - 1 + months) % 12) + 1
    return datetime(year, month, 1)

def _round(value: float, digits: int = 2) -> float:
    return round(float(value or 0.0), digits)

def _reading_to_asset_unit(reading: models.MeterReading, asset_type: str, fallback_value: float) -> float:
    """
    Convert available readings to the unit returned by the forecast endpoint:
    transformer -> kVA, feeder -> MW.
    """
    if reading.power_kw is not None:
        return reading.power_kw / 0.85 if asset_type == "transformer" else reading.power_kw / 1000.0
    if reading.energy_kwh is not None:
        average_kw = reading.energy_kwh / (30.0 * 24.0)
        return average_kw / 0.85 if asset_type == "transformer" else average_kw / 1000.0
    return fallback_value

def _monthly_history(
    db: Session,
    asset_type: str,
    asset_id: int,
    fallback_value: float
) -> List[Tuple[datetime, float]]:
    readings = db.query(models.MeterReading).filter(
        models.MeterReading.asset_id == asset_id,
        models.MeterReading.asset_type == asset_type
    ).order_by(models.MeterReading.timestamp).all()

    by_month: Dict[datetime, List[float]] = {}
    for reading in readings:
        month = _month_start(reading.timestamp)
        by_month.setdefault(month, []).append(_reading_to_asset_unit(reading, asset_type, fallback_value))

    return [
        (month, float(np.mean(values)))
        for month, values in sorted(by_month.items())
        if values
    ]

def _fallback_history(base_load: float, now: datetime) -> List[Tuple[datetime, float]]:
    history = []
    for offset in range(12, 0, -1):
        month = _add_months(_month_start(now), -offset)
        age_index = 12 - offset
        growth_trend = 1.0 + (age_index * 0.004)
        seasonal = SEASONAL_FACTORS[month.month - 1]
        history.append((month, base_load * seasonal * growth_trend))
    return history

def _fit_linear_trend(values: List[float]) -> Tuple[float, float, float]:
    if len(values) < MIN_HISTORY_POINTS_FOR_TREND:
        baseline = values[-1] if values else 0.0
        return baseline, baseline * DEFAULT_MONTHLY_GROWTH, baseline * 0.08

    x = np.arange(len(values), dtype=float)
    y = np.array(values, dtype=float)
    slope, intercept = np.polyfit(x, y, 1)
    fitted = intercept + slope * x
    residual_std = float(np.std(y - fitted)) if len(values) > 2 else max(float(np.mean(y)) * 0.08, 0.01)
    return float(intercept), float(slope), max(residual_std, max(float(np.mean(y)) * 0.04, 0.01))

def _seasonal_adjustment(history: List[Tuple[datetime, float]]) -> List[float]:
    values = [point[1] for point in history]
    average = float(np.mean(values)) if values else 0.0
    if average <= 0:
        return SEASONAL_FACTORS

    month_ratios: Dict[int, List[float]] = {}
    for date, value in history:
        month_ratios.setdefault(date.month, []).append(value / average)

    factors = []
    for month in range(1, 13):
        if month in month_ratios:
            factors.append(float(np.mean(month_ratios[month])))
        else:
            factors.append(SEASONAL_FACTORS[month - 1])

    factor_average = float(np.mean(factors)) or 1.0
    return [factor / factor_average for factor in factors]

@cached(ttl_seconds=300, prefix="forecast")
def forecast_asset_demand(db: Session, asset_type: str, asset_id: int, months_ahead: int = 12) -> Dict[str, Any]:
    """
    Generates a 12-month demand forecast (kVA or MW depending on asset type)
    using a seasonal trend model with confidence intervals.
    """
    # 1. Fetch asset details
    if asset_type == "transformer":
        asset = db.query(models.Transformer).filter(models.Transformer.id == asset_id).first()
        unit = "kVA"
        base_load = asset.peak_load_kva if asset else 50.0
    elif asset_type == "feeder":
        asset = db.query(models.Feeder).filter(models.Feeder.id == asset_id).first()
        unit = "MW"
        base_load = asset.peak_load_mw if asset else 5.0
    else:
        return {"error": "Unsupported asset type for forecasting"}
        
    if not asset:
        return {"error": f"Asset {asset_type} {asset_id} not found"}

    now = datetime.utcnow()
    history = _monthly_history(db, asset_type, asset_id, base_load)
    data_source = "meter_readings"
    if len(history) < MIN_HISTORY_POINTS_FOR_TREND:
        history = _fallback_history(base_load, now)
        data_source = "deterministic_asset_profile"

    history = history[-24:]
    history_dates = [point[0] for point in history]
    history_values = [point[1] for point in history]
    seasonal_factors = _seasonal_adjustment(history)
    intercept, slope, residual_std = _fit_linear_trend(history_values)

    last_history_index = len(history_values) - 1
    last_history_value = history_values[-1] if history_values else base_load
    forecast_dates = [_add_months(_month_start(now), i) for i in range(1, months_ahead + 1)]
    forecast_values = []
    lower_bounds = []
    upper_bounds = []

    for i, f_date in enumerate(forecast_dates):
        trend_projection = intercept + slope * (last_history_index + i + 1)
        if trend_projection <= 0:
            trend_projection = last_history_value * ((1 + DEFAULT_MONTHLY_GROWTH) ** (i + 1))

        last_month_factor = seasonal_factors[history_dates[-1].month - 1] or 1.0
        month_factor = seasonal_factors[f_date.month - 1]
        point_forecast = max(0.0, trend_projection * (month_factor / last_month_factor))

        std_error = residual_std * (1.0 + (i * 0.12))
        lower = max(0.0, point_forecast - 1.96 * std_error)
        upper = point_forecast + 1.96 * std_error

        forecast_values.append(round(point_forecast, 2))
        lower_bounds.append(round(lower, 2))
        upper_bounds.append(round(upper, 2))

    # Combine history and forecast for rendering
    historical_points = [
        {"date": d.strftime("%Y-%m-%d"), "value": _round(val), "type": "historical"}
        for d, val in zip(history_dates, history_values)
    ]
    
    forecast_points = [
        {
            "date": d.strftime("%Y-%m-%d"),
            "value": val,
            "lower_bound": lb,
            "upper_bound": ub,
            "type": "forecast"
        }
        for d, val, lb, ub in zip(forecast_dates, forecast_values, lower_bounds, upper_bounds)
    ]
    
    return {
        "asset_id": asset_id,
        "asset_type": asset_type,
        "asset_name": asset.name,
        "asset_code": asset.code,
        "unit": unit,
        "history": historical_points,
        "forecast": forecast_points,
        "summary": {
            "current_peak": round(base_load, 2),
            "projected_peak_12m": round(forecast_values[-1], 2),
            "percentage_increase": round(((forecast_values[-1] - base_load) / base_load) * 100.0, 1) if base_load else 0.0,
            "confidence_level": "95%",
            "model_used": "Seasonal trend regression",
            "data_source": data_source,
            "history_points": len(historical_points),
            "monthly_trend": round(slope, 4),
            "residual_std": round(residual_std, 3)
        }
    }
