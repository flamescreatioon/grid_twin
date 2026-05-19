from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

# --- Substation ---
class SubstationBase(BaseModel):
    name: str
    code: str
    voltage_level: str
    capacity_mva: float
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str = "operational"
    district: Optional[str] = None

class SubstationCreate(SubstationBase):
    pass

class SubstationUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    voltage_level: Optional[str] = None
    capacity_mva: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: Optional[str] = None
    district: Optional[str] = None

class SubstationResponse(SubstationBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Feeder ---
class FeederBase(BaseModel):
    code: str
    name: str
    voltage_level: str
    source_substation_id: int
    route_coordinates: Optional[List[List[float]]] = None  # [[lon1, lat1], [lon2, lat2], ...]
    peak_load_mw: float = 0.0
    rated_capacity_mw: float
    risk_score: float = 0.0
    status: str = "operational"

class FeederCreate(FeederBase):
    pass

class FeederUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    voltage_level: Optional[str] = None
    source_substation_id: Optional[int] = None
    route_coordinates: Optional[List[List[float]]] = None
    peak_load_mw: Optional[float] = None
    rated_capacity_mw: Optional[float] = None
    risk_score: Optional[float] = None
    status: Optional[str] = None

class FeederResponse(FeederBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Transformer ---
class TransformerBase(BaseModel):
    code: str
    feeder_id: int
    name: str
    rating_kva: float
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    customer_count: int = 0
    peak_load_kva: float = 0.0
    loading_percentage: float = 0.0
    risk_score: float = 0.0
    status: str = "operational"
    installation_year: Optional[int] = None
    last_maintenance_date: Optional[datetime] = None

class TransformerCreate(TransformerBase):
    pass

class TransformerUpdate(BaseModel):
    code: Optional[str] = None
    feeder_id: Optional[int] = None
    name: Optional[str] = None
    rating_kva: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    customer_count: Optional[int] = None
    peak_load_kva: Optional[float] = None
    loading_percentage: Optional[float] = None
    risk_score: Optional[float] = None
    status: Optional[str] = None
    installation_year: Optional[int] = None
    last_maintenance_date: Optional[datetime] = None

class TransformerResponse(TransformerBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Customer Cluster ---
class CustomerClusterBase(BaseModel):
    transformer_id: int
    name: str
    customer_count: int = 0
    tariff_mix: Optional[Dict[str, float]] = None  # e.g., {"R2": 60, "C1": 40}
    estimated_demand_kw: float = 0.0
    polygon_coordinates: Optional[List[List[List[float]]]] = None  # [[[lon, lat], ...]]

class CustomerClusterCreate(CustomerClusterBase):
    pass

class CustomerClusterUpdate(BaseModel):
    transformer_id: Optional[int] = None
    name: Optional[str] = None
    customer_count: Optional[int] = None
    tariff_mix: Optional[Dict[str, float]] = None
    estimated_demand_kw: Optional[float] = None
    polygon_coordinates: Optional[List[List[List[float]]]] = None

class CustomerClusterResponse(CustomerClusterBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Meter Reading ---
class MeterReadingBase(BaseModel):
    asset_id: int
    asset_type: str
    voltage: Optional[float] = None
    current: Optional[float] = None
    power_kw: Optional[float] = None
    energy_kwh: Optional[float] = None
    timestamp: Optional[datetime] = None

class MeterReadingCreate(MeterReadingBase):
    pass

class MeterReadingResponse(MeterReadingBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Outage Event ---
class OutageEventBase(BaseModel):
    affected_asset_id: int
    affected_asset_type: str
    outage_start: datetime
    outage_end: Optional[datetime] = None
    cause: str
    affected_customers: int = 0
    estimated_energy_lost: float = 0.0
    estimated_revenue_lost: float = 0.0
    status: str = "active"

class OutageEventCreate(OutageEventBase):
    pass

class OutageEventUpdate(BaseModel):
    outage_end: Optional[datetime] = None
    cause: Optional[str] = None
    affected_customers: Optional[int] = None
    estimated_energy_lost: Optional[float] = None
    estimated_revenue_lost: Optional[float] = None
    status: Optional[str] = None

class OutageEventResponse(OutageEventBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Maintenance Record ---
class MaintenanceRecordBase(BaseModel):
    asset_id: int
    asset_type: str
    date: datetime
    activity_type: str
    description: Optional[str] = None
    technician: Optional[str] = None
    next_due_date: Optional[datetime] = None

class MaintenanceRecordCreate(MaintenanceRecordBase):
    pass

class MaintenanceRecordResponse(MaintenanceRecordBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Investment Scenario ---
class InvestmentScenarioBase(BaseModel):
    name: str
    scenario_type: str
    target_asset_id: int
    target_asset_type: str
    estimated_cost: float
    expected_benefit: Optional[str] = None
    risk_reduction: float = 0.0
    customer_impact: int = 0
    reliability_improvement: float = 0.0
    revenue_protection: float = 0.0
    implementation_time_days: int
    priority_score: float = 0.0

class InvestmentScenarioCreate(InvestmentScenarioBase):
    pass

class InvestmentScenarioUpdate(BaseModel):
    name: Optional[str] = None
    scenario_type: Optional[str] = None
    target_asset_id: Optional[int] = None
    target_asset_type: Optional[str] = None
    estimated_cost: Optional[float] = None
    expected_benefit: Optional[str] = None
    risk_reduction: Optional[float] = None
    customer_impact: Optional[int] = None
    reliability_improvement: Optional[float] = None
    revenue_protection: Optional[float] = None
    implementation_time_days: Optional[int] = None
    priority_score: Optional[float] = None

class InvestmentScenarioResponse(InvestmentScenarioBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
