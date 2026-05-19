import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.auth.models import User
from app.auth.services import create_user
from app.auth.schemas import UserCreate
from app.assets import models
from app.core.security import get_password_hash

def seed_database(db: Session):
    # Check if we already have users or assets
    if db.query(User).count() > 0:
        return
        
    print("Seeding database...")
    
    # 1. Create Default Users with different roles
    users = [
        UserCreate(email="admin@gridtwin.ng", full_name="System Administrator", password="admin123", role="SYSTEM_ADMIN"),
        UserCreate(email="planner@gridtwin.ng", full_name="Lead Planning Engineer", password="admin123", role="PLANNING_ENGINEER"),
        UserCreate(email="operations@gridtwin.ng", full_name="Operations Engineer", password="admin123", role="OPERATIONS_ENGINEER"),
        UserCreate(email="viewer@gridtwin.ng", full_name="AEDC Executive Viewer", password="admin123", role="VIEWER"),
    ]
    
    db_users = []
    for u in users:
        db_u = User(
            email=u.email,
            full_name=u.full_name,
            password_hash=get_password_hash(u.password),
            role=u.role,
            is_active=True
        )
        db.add(db_u)
        db_users.append(db_u)
    db.commit()
    
    # 2. Create 1 Injection Substation
    sub_lon, sub_lat = 7.4897, 9.0243  # Central Garki, Abuja coordinates
    substation = models.Substation(
        name="Garki 2 Injection Substation",
        code="GK2_IS",
        voltage_level="33/11kV",
        capacity_mva=30.0,
        latitude=sub_lat,
        longitude=sub_lon,
        location=f"POINT({sub_lon} {sub_lat})",
        status="operational",
        district="Abuja South"
    )
    db.add(substation)
    db.commit()
    db.refresh(substation)
    
    # 3. Create 5 Feeders radiating outward
    feeder_configs = [
        {"name": "F1 - Garki Area 11", "code": "GK2_F01", "voltage": "11kV", "capacity": 15.0, "dir": (0.01, 0.01)},
        {"name": "F2 - Garki Area 2", "code": "GK2_F02", "voltage": "11kV", "capacity": 8.0, "dir": (-0.01, -0.01)},
        {"name": "F3 - Garki Area 8", "code": "GK2_F03", "voltage": "11kV", "capacity": 8.0, "dir": (0.01, -0.01)},
        {"name": "F4 - Area 3 Residential", "code": "GK2_F04", "voltage": "11kV", "capacity": 6.0, "dir": (-0.01, 0.01)},
        {"name": "F5 - Commercial Central", "code": "GK2_F05", "voltage": "11kV", "capacity": 10.0, "dir": (0.0, 0.015)}
    ]
    
    db_feeders = []
    for conf in feeder_configs:
        # Route: 4 points radiating outward from Substation
        dx, dy = conf["dir"]
        route_coords = [
            [sub_lon, sub_lat],
            [sub_lon + dx * 0.33, sub_lat + dy * 0.33],
            [sub_lon + dx * 0.66, sub_lat + dy * 0.66],
            [sub_lon + dx, sub_lat + dy]
        ]
        
        fd = models.Feeder(
            code=conf["code"],
            name=conf["name"],
            voltage_level=conf["voltage"],
            source_substation_id=substation.id,
            route_coordinates=route_coords,
            route_geometry=f"LINESTRING({', '.join([f'{p[0]} {p[1]}' for p in route_coords])})",
            peak_load_mw=round(conf["capacity"] * random.uniform(0.5, 0.85), 2),
            rated_capacity_mw=conf["capacity"],
            status="operational",
            risk_score=0.0  # calculated later
        )
        db.add(fd)
        db_feeders.append(fd)
        
    db.commit()
    
    # 4. Create 150 Transformers (30 per feeder)
    db_transformers = []
    tx_index = 1
    
    ratings = [100, 200, 300, 500]
    
    for fd in db_feeders:
        # Locate points along the feeder route to cluster transformers
        route = fd.route_coordinates
        for i in range(30):
            # Interpolate coordinates along route
            segment_idx = (i // 10) % (len(route) - 1)
            t_factor = (i % 10) / 10.0
            
            p1 = route[segment_idx]
            p2 = route[segment_idx + 1]
            
            tx_lon = p1[0] + (p2[0] - p1[0]) * t_factor + random.uniform(-0.001, 0.001)
            tx_lat = p1[1] + (p2[1] - p1[1]) * t_factor + random.uniform(-0.001, 0.001)
            
            rating = random.choice(ratings)
            # Create some overloaded transformers for realistic planning simulation
            if i in [5, 12, 18, 27]:
                loading_pct = random.uniform(101.0, 128.0)
            elif i in [2, 9, 21]:
                loading_pct = random.uniform(91.0, 99.0)
            else:
                loading_pct = random.uniform(40.0, 85.0)
                
            peak_load = round((rating * loading_pct) / 100.0, 1)
            cust_count = int(rating * random.uniform(0.4, 0.8))
            
            # Installation dates: older transformers have higher risk scores
            age_years = random.randint(1, 28)
            install_year = datetime.utcnow().year - age_years
            
            # Maintenance dates
            last_maint = datetime.utcnow() - timedelta(days=random.randint(30, 700))
            
            tx = models.Transformer(
                code=f"GK2-TX-{tx_index:03d}",
                feeder_id=fd.id,
                name=f"Transformer #{tx_index} ({fd.code})",
                rating_kva=rating,
                latitude=tx_lat,
                longitude=tx_lon,
                location=f"POINT({tx_lon} {tx_lat})",
                customer_count=cust_count,
                peak_load_kva=peak_load,
                loading_percentage=round(loading_pct, 1),
                status="overloaded" if loading_pct > 100.0 else "operational",
                installation_year=install_year,
                last_maintenance_date=last_maint,
                risk_score=0.0
            )
            db.add(tx)
            db_transformers.append(tx)
            tx_index += 1
            
    db.commit()
    
    # 5. Create 300 Customer/Load Clusters (2 per transformer)
    cluster_index = 1
    for tx in db_transformers:
        for side in [-1, 1]:
            # Generate small polygon around the transformer coordinates
            offset_x = side * 0.0008
            offset_y = side * 0.0004
            
            p_lon, p_lat = tx.longitude + offset_x, tx.latitude + offset_y
            r = 0.0005 # radius
            
            # 5-point closed polygon square
            poly_coords = [[
                [p_lon - r, p_lat - r],
                [p_lon + r, p_lat - r],
                [p_lon + r, p_lat + r],
                [p_lon - r, p_lat + r],
                [p_lon - r, p_lat - r]
            ]]
            
            # Customer count split
            cust_split = max(5, tx.customer_count // 2)
            demand_kw = round(cust_split * random.uniform(0.4, 0.95), 1)
            
            cc = models.CustomerCluster(
                transformer_id=tx.id,
                name=f"Cluster GK2-CC-{cluster_index:03d}",
                customer_count=cust_split,
                tariff_mix={"R2": 65.0, "C1": 25.0, "D1": 10.0},
                estimated_demand_kw=demand_kw,
                polygon_coordinates=poly_coords,
                geometry=f"POLYGON(({', '.join([f'{p[0]} {p[1]}' for p in poly_coords[0]])}))"
            )
            db.add(cc)
            cluster_index += 1
            
    db.commit()
    
    # 6. Recalculate all risk scores using our formula to seed the scores properly
    from app.risk.scoring import recalculate_all_asset_scores
    recalculate_all_asset_scores(db)
    
    # 7. Create 12 Months of Synthetic Meter Readings (select key transformers)
    print("Seeding synthetic meter readings...")
    sample_txs = db_transformers[:10]  # seed readings for the first 10 transformers
    now = datetime.utcnow()
    for tx in sample_txs:
        for month_offset in range(12, 0, -1):
            ts = now - timedelta(days=30 * month_offset)
            reading = models.MeterReading(
                asset_id=tx.id,
                asset_type="transformer",
                timestamp=ts,
                voltage=round(random.uniform(390.0, 415.0), 1),
                current=round(random.uniform(10.0, 150.0), 1),
                power_kw=round(tx.peak_load_kva * 0.85 * random.uniform(0.7, 0.95), 1),
                energy_kwh=round(tx.peak_load_kva * 0.85 * 24 * 30 * random.uniform(0.5, 0.7), 1)
            )
            db.add(reading)
            
    db.commit()
    
    # 8. Create Outages History
    print("Seeding synthetic outages...")
    outage_causes = ["Feeder Overload Tripping", "Heavy Rainstorm Damage", "Transformer Blown Fuse", "Grid Load Shedding"]
    for i in range(25):
        # pick random transformer or feeder
        asset_type = random.choice(["transformer", "feeder"])
        if asset_type == "transformer":
            asset = random.choice(db_transformers)
            custs = asset.customer_count
            lost_power = asset.peak_load_kva * 0.85
        else:
            asset = random.choice(db_feeders)
            custs = sum([t.customer_count for t in asset.transformers])
            lost_power = asset.peak_load_mw * 1000.0
            
        hours = random.uniform(1.0, 8.0)
        energy_lost = lost_power * hours
        rev_lost = energy_lost * 85.0 # NGN per kWh
        
        # Outage start
        start = now - timedelta(days=random.randint(2, 360), hours=random.randint(1, 24))
        end = start + timedelta(hours=hours)
        
        db_outage = models.OutageEvent(
            affected_asset_id=asset.id,
            affected_asset_type=asset_type,
            outage_start=start,
            outage_end=end,
            cause=random.choice(outage_causes),
            affected_customers=custs,
            estimated_energy_lost=round(energy_lost, 1),
            estimated_revenue_lost=round(rev_lost, 2),
            status="resolved"
        )
        db.add(db_outage)
        
    db.commit()
    
    # 9. Create Maintenance Records
    print("Seeding synthetic maintenance logs...")
    maint_activities = ["Transformer Oil Top-up", "Feeder Line Clearing", "Substation Relay Calibration", "Fuse Replacement"]
    for i in range(30):
        asset = random.choice(db_transformers)
        rec = models.MaintenanceRecord(
            asset_id=asset.id,
            asset_type="transformer",
            date=now - timedelta(days=random.randint(5, 300)),
            activity_type=random.choice(["routine", "repair", "emergency"]),
            description=random.choice(maint_activities),
            technician="Engr. O. Bello (Garki Area Office)",
            next_due_date=now + timedelta(days=random.randint(60, 200))
        )
        db.add(rec)
    db.commit()
    
    # 10. Seed Sample Investment Scenarios
    print("Seeding investment scenarios...")
    # Select overloaded transformer to propose upgrade
    overloaded_txs = [t for t in db_transformers if t.loading_percentage > 100.0]
    if overloaded_txs:
        target_tx = overloaded_txs[0]
        
        # Scenario 1: Upgrade transformer
        s1 = models.InvestmentScenario(
            name=f"Upgrade Overloaded Transformer {target_tx.code} from {target_tx.rating_kva}kVA to 500kVA",
            scenario_type="transformer_replacement",
            target_asset_id=target_tx.id,
            target_asset_type="transformer",
            estimated_cost=4_200_000.0,  # in NGN
            expected_benefit="Relieves overloaded distribution point, prevents transformer damage, and secures supply for 120+ households.",
            risk_reduction=45.2, # points
            customer_impact=target_tx.customer_count,
            reliability_improvement=25.0, # %
            revenue_protection=180_000.0, # NGN/month saved from outages
            implementation_time_days=14,
            priority_score=78.5,  # calculated
            created_by=db_users[0].id
        )
        db.add(s1)
        
    # Scenario 2: Reinforce feeder
    target_fd = db_feeders[1] # GK2_F02
    s2 = models.InvestmentScenario(
        name=f"Reinforce conductor sections on {target_fd.name}",
        scenario_type="feeder_reinforcement",
        target_asset_id=target_fd.id,
        target_asset_type="feeder",
        estimated_cost=18_500_000.0,
        expected_benefit="Replaces undersized aluminum conductors on critical paths, reducing line losses by 4% and thermal tripping events.",
        risk_reduction=32.8,
        customer_impact=1400,
        reliability_improvement=18.5,
        revenue_protection=650_000.0,
        implementation_time_days=45,
        priority_score=68.2,
        created_by=db_users[0].id
    )
    db.add(s2)
    
    db.commit()
    print("Database seeding completed successfully!")
