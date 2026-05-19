from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base, get_geometry_type

class Substation(Base):
    __tablename__ = "substations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    code = Column(String, unique=True, index=True, nullable=False)
    voltage_level = Column(String, nullable=False)  # e.g., "33kV", "11kV"
    capacity_mva = Column(Float, nullable=False)
    location = Column(get_geometry_type("POINT", 4326), nullable=True)
    latitude = Column(Float, nullable=True)  # explicit coordinate fallback for SQLite
    longitude = Column(Float, nullable=True) # explicit coordinate fallback for SQLite
    status = Column(String, default="operational", nullable=False)  # operational, maintenance, offline
    district = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    feeders = relationship("Feeder", back_populates="substation", cascade="all, delete-orphan")


class Feeder(Base):
    __tablename__ = "feeders"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, index=True, nullable=False)
    voltage_level = Column(String, nullable=False)  # e.g., "11kV", "415V"
    source_substation_id = Column(Integer, ForeignKey("substations.id"), nullable=False)
    route_geometry = Column(get_geometry_type("LINESTRING", 4326), nullable=True)
    route_coordinates = Column(JSON, nullable=True)  # explicit JSON coordinates array fallback: [[lon, lat], ...]
    peak_load_mw = Column(Float, default=0.0, nullable=False)
    rated_capacity_mw = Column(Float, nullable=False)
    risk_score = Column(Float, default=0.0, nullable=False)
    status = Column(String, default="operational", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    substation = relationship("Substation", back_populates="feeders")
    transformers = relationship("Transformer", back_populates="feeder", cascade="all, delete-orphan")


class Transformer(Base):
    __tablename__ = "transformers"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    feeder_id = Column(Integer, ForeignKey("feeders.id"), nullable=False)
    name = Column(String, index=True, nullable=False)
    rating_kva = Column(Float, nullable=False)
    location = Column(get_geometry_type("POINT", 4326), nullable=True)
    latitude = Column(Float, nullable=True)  # explicit coordinate fallback for SQLite
    longitude = Column(Float, nullable=True) # explicit coordinate fallback for SQLite
    customer_count = Column(Integer, default=0, nullable=False)
    peak_load_kva = Column(Float, default=0.0, nullable=False)
    loading_percentage = Column(Float, default=0.0, nullable=False)  # Peak Load / Rating * 100
    risk_score = Column(Float, default=0.0, nullable=False)
    status = Column(String, default="operational", nullable=False)  # operational, overloaded, maintenance, offline
    installation_year = Column(Integer, nullable=True)
    last_maintenance_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    feeder = relationship("Feeder", back_populates="transformers")
    customer_clusters = relationship("CustomerCluster", back_populates="transformer", cascade="all, delete-orphan")


class CustomerCluster(Base):
    __tablename__ = "customer_clusters"

    id = Column(Integer, primary_key=True, index=True)
    transformer_id = Column(Integer, ForeignKey("transformers.id"), nullable=False)
    name = Column(String, index=True, nullable=False)
    customer_count = Column(Integer, default=0, nullable=False)
    tariff_mix = Column(JSON, nullable=True)  # e.g., {"R2": 60, "C1": 30, "D1": 10}
    estimated_demand_kw = Column(Float, default=0.0, nullable=False)
    geometry = Column(get_geometry_type("POLYGON", 4326), nullable=True)
    polygon_coordinates = Column(JSON, nullable=True)  # explicit JSON coordinates fallback: [[[lon1, lat1], [lon2, lat2], ...]]
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    transformer = relationship("Transformer", back_populates="customer_clusters")


class MeterReading(Base):
    __tablename__ = "meter_readings"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, nullable=False)
    asset_type = Column(String, nullable=False)  # "substation", "feeder", "transformer", "customer_cluster"
    timestamp = Column(DateTime, index=True, default=datetime.utcnow, nullable=False)
    voltage = Column(Float, nullable=True)
    current = Column(Float, nullable=True)
    power_kw = Column(Float, nullable=True)
    energy_kwh = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class OutageEvent(Base):
    __tablename__ = "outage_events"

    id = Column(Integer, primary_key=True, index=True)
    affected_asset_id = Column(Integer, nullable=False)
    affected_asset_type = Column(String, nullable=False)  # "substation", "feeder", "transformer"
    outage_start = Column(DateTime, index=True, default=datetime.utcnow, nullable=False)
    outage_end = Column(DateTime, nullable=True)
    cause = Column(String, nullable=False)  # e.g., "Faulty transformer", "Grid collapse", "Load shedding"
    affected_customers = Column(Integer, default=0, nullable=False)
    estimated_energy_lost = Column(Float, default=0.0, nullable=False)  # in kWh
    estimated_revenue_lost = Column(Float, default=0.0, nullable=False)  # in NGN (Nigerian Naira)
    status = Column(String, default="active", nullable=False)  # active, resolved
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, nullable=False)
    asset_type = Column(String, nullable=False)  # "substation", "feeder", "transformer"
    date = Column(DateTime, default=datetime.utcnow, nullable=False)
    activity_type = Column(String, nullable=False)  # routine, emergency, repair, installation
    description = Column(Text, nullable=True)
    technician = Column(String, nullable=True)
    next_due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class InvestmentScenario(Base):
    __tablename__ = "investment_scenarios"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    scenario_type = Column(String, nullable=False)  # e.g., "transformer_replacement", "feeder_reinforcement", "load_splitting"
    target_asset_id = Column(Integer, nullable=False)
    target_asset_type = Column(String, nullable=False)  # "feeder", "transformer"
    estimated_cost = Column(Float, nullable=False)  # in NGN
    expected_benefit = Column(Text, nullable=True)
    risk_reduction = Column(Float, default=0.0, nullable=False)  # score reduction e.g. 15.5 points
    customer_impact = Column(Integer, default=0, nullable=False)  # number of customers impacted
    reliability_improvement = Column(Float, default=0.0, nullable=False)  # e.g. 10.5% SAIDI reduction
    revenue_protection = Column(Float, default=0.0, nullable=False)  # expected savings in NGN/month
    implementation_time_days = Column(Integer, nullable=False)
    priority_score = Column(Float, default=0.0, nullable=False)  # calculated index
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
