from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.auth.routes import get_current_user, require_role
from app.auth.models import User
from app.assets import models, schemas
from app.core.cache import invalidate_grid_cache

router = APIRouter(prefix="/assets", tags=["assets"])

# Helper function to construct WKT Point
def lat_lon_to_wkt_point(lon: float, lat: float) -> str:
    return f"POINT({lon} {lat})"

# Helper function to construct WKT LineString
def coords_to_wkt_linestring(coords: List[List[float]]) -> str:
    points = ", ".join([f"{p[0]} {p[1]}" for p in coords])
    return f"LINESTRING({points})"

# Helper function to construct WKT Polygon
def coords_to_wkt_polygon(coords: List[List[List[float]]]) -> str:
    rings = []
    for ring in coords:
        points = ", ".join([f"{p[0]} {p[1]}" for p in ring])
        # Ensure polygon ring is closed
        if ring and (ring[0][0] != ring[-1][0] or ring[0][1] != ring[-1][1]):
            points += f", {ring[0][0]} {ring[0][1]}"
        rings.append(f"({points})")
    return f"POLYGON({', '.join(rings)})"


# --- Substations ---
@router.get("/substations", response_model=List[schemas.SubstationResponse])
def get_substations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(models.Substation).all()

@router.post("/substations", response_model=schemas.SubstationResponse, status_code=status.HTTP_201_CREATED)
def create_substation(substation_in: schemas.SubstationCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER"]))):
    db_sub = db.query(models.Substation).filter(models.Substation.code == substation_in.code).first()
    if db_sub:
        raise HTTPException(status_code=400, detail="Substation with this code already exists")
    
    db_substation = models.Substation(**substation_in.dict())
    if substation_in.longitude is not None and substation_in.latitude is not None:
        db_substation.location = lat_lon_to_wkt_point(substation_in.longitude, substation_in.latitude)
        
    db.add(db_substation)
    db.commit()
    db.refresh(db_substation)
    invalidate_grid_cache()
    return db_substation

@router.get("/substations/{substation_id}", response_model=schemas.SubstationResponse)
def get_substation(substation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_sub = db.query(models.Substation).filter(models.Substation.id == substation_id).first()
    if not db_sub:
        raise HTTPException(status_code=404, detail="Substation not found")
    return db_sub

@router.put("/substations/{substation_id}", response_model=schemas.SubstationResponse)
def update_substation(substation_id: int, substation_in: schemas.SubstationUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER"]))):
    db_sub = db.query(models.Substation).filter(models.Substation.id == substation_id).first()
    if not db_sub:
        raise HTTPException(status_code=404, detail="Substation not found")
    
    update_data = substation_in.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_sub, key, value)
        
    if "longitude" in update_data or "latitude" in update_data:
        lon = db_sub.longitude
        lat = db_sub.latitude
        if lon is not None and lat is not None:
            db_sub.location = lat_lon_to_wkt_point(lon, lat)
            
    db.commit()
    db.refresh(db_sub)
    invalidate_grid_cache()
    return db_sub

@router.delete("/substations/{substation_id}")
def delete_substation(substation_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN"]))):
    db_sub = db.query(models.Substation).filter(models.Substation.id == substation_id).first()
    if not db_sub:
        raise HTTPException(status_code=404, detail="Substation not found")
    db.delete(db_sub)
    db.commit()
    invalidate_grid_cache()
    return {"message": "Substation deleted successfully"}


# --- Feeders ---
@router.get("/feeders", response_model=List[schemas.FeederResponse])
def get_feeders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(models.Feeder).all()

@router.post("/feeders", response_model=schemas.FeederResponse, status_code=status.HTTP_201_CREATED)
def create_feeder(feeder_in: schemas.FeederCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER"]))):
    db_fd = db.query(models.Feeder).filter(models.Feeder.code == feeder_in.code).first()
    if db_fd:
        raise HTTPException(status_code=400, detail="Feeder with this code already exists")
    
    # Verify substation exists
    sub = db.query(models.Substation).filter(models.Substation.id == feeder_in.source_substation_id).first()
    if not sub:
        raise HTTPException(status_code=400, detail="Source substation does not exist")
        
    db_feeder = models.Feeder(**feeder_in.dict())
    if feeder_in.route_coordinates:
        db_feeder.route_geometry = coords_to_wkt_linestring(feeder_in.route_coordinates)
        
    db.add(db_feeder)
    db.commit()
    db.refresh(db_feeder)
    invalidate_grid_cache()
    return db_feeder

@router.get("/feeders/{feeder_id}", response_model=schemas.FeederResponse)
def get_feeder(feeder_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_feeder = db.query(models.Feeder).filter(models.Feeder.id == feeder_id).first()
    if not db_feeder:
        raise HTTPException(status_code=404, detail="Feeder not found")
    return db_feeder

@router.put("/feeders/{feeder_id}", response_model=schemas.FeederResponse)
def update_feeder(feeder_id: int, feeder_in: schemas.FeederUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER"]))):
    db_feeder = db.query(models.Feeder).filter(models.Feeder.id == feeder_id).first()
    if not db_feeder:
        raise HTTPException(status_code=404, detail="Feeder not found")
    
    update_data = feeder_in.dict(exclude_unset=True)
    
    if "source_substation_id" in update_data:
        sub = db.query(models.Substation).filter(models.Substation.id == update_data["source_substation_id"]).first()
        if not sub:
            raise HTTPException(status_code=400, detail="Source substation does not exist")
            
    for key, value in update_data.items():
        setattr(db_feeder, key, value)
        
    if "route_coordinates" in update_data and update_data["route_coordinates"]:
        db_feeder.route_geometry = coords_to_wkt_linestring(update_data["route_coordinates"])
        
    db.commit()
    db.refresh(db_feeder)
    invalidate_grid_cache()
    return db_feeder

@router.delete("/feeders/{feeder_id}")
def delete_feeder(feeder_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN"]))):
    db_feeder = db.query(models.Feeder).filter(models.Feeder.id == feeder_id).first()
    if not db_feeder:
        raise HTTPException(status_code=404, detail="Feeder not found")
    db.delete(db_feeder)
    db.commit()
    invalidate_grid_cache()
    return {"message": "Feeder deleted successfully"}


# --- Transformers ---
@router.get("/assets/transformers", response_model=List[schemas.TransformerResponse])
@router.get("/transformers", response_model=List[schemas.TransformerResponse])
def get_transformers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(models.Transformer).all()

@router.post("/transformers", response_model=schemas.TransformerResponse, status_code=status.HTTP_201_CREATED)
def create_transformer(tx_in: schemas.TransformerCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER"]))):
    db_tx = db.query(models.Transformer).filter(models.Transformer.code == tx_in.code).first()
    if db_tx:
        raise HTTPException(status_code=400, detail="Transformer with this code already exists")
    
    # Verify feeder exists
    fd = db.query(models.Feeder).filter(models.Feeder.id == tx_in.feeder_id).first()
    if not fd:
        raise HTTPException(status_code=400, detail="Feeder does not exist")
        
    db_transformer = models.Transformer(**tx_in.dict())
    if tx_in.longitude is not None and tx_in.latitude is not None:
        db_transformer.location = lat_lon_to_wkt_point(tx_in.longitude, tx_in.latitude)
        
    db.add(db_transformer)
    db.commit()
    db.refresh(db_transformer)
    invalidate_grid_cache()
    return db_transformer

@router.get("/transformers/{transformer_id}", response_model=schemas.TransformerResponse)
def get_transformer(transformer_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_tx = db.query(models.Transformer).filter(models.Transformer.id == transformer_id).first()
    if not db_tx:
        raise HTTPException(status_code=404, detail="Transformer not found")
    return db_tx

@router.put("/transformers/{transformer_id}", response_model=schemas.TransformerResponse)
def update_transformer(transformer_id: int, tx_in: schemas.TransformerUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER"]))):
    db_tx = db.query(models.Transformer).filter(models.Transformer.id == transformer_id).first()
    if not db_tx:
        raise HTTPException(status_code=404, detail="Transformer not found")
    
    update_data = tx_in.dict(exclude_unset=True)
    
    if "feeder_id" in update_data:
        fd = db.query(models.Feeder).filter(models.Feeder.id == update_data["feeder_id"]).first()
        if not fd:
            raise HTTPException(status_code=400, detail="Feeder does not exist")
            
    for key, value in update_data.items():
        setattr(db_tx, key, value)
        
    if "longitude" in update_data or "latitude" in update_data:
        lon = db_tx.longitude
        lat = db_tx.latitude
        if lon is not None and lat is not None:
            db_tx.location = lat_lon_to_wkt_point(lon, lat)
            
    db.commit()
    db.refresh(db_tx)
    invalidate_grid_cache()
    return db_tx

@router.delete("/transformers/{transformer_id}")
def delete_transformer(transformer_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN"]))):
    db_tx = db.query(models.Transformer).filter(models.Transformer.id == transformer_id).first()
    if not db_tx:
        raise HTTPException(status_code=404, detail="Transformer not found")
    db.delete(db_tx)
    db.commit()
    invalidate_grid_cache()
    return {"message": "Transformer deleted successfully"}


# --- Customer Clusters ---
@router.get("/customer-clusters", response_model=List[schemas.CustomerClusterResponse])
def get_customer_clusters(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(models.CustomerCluster).all()

@router.post("/customer-clusters", response_model=schemas.CustomerClusterResponse, status_code=status.HTTP_201_CREATED)
def create_customer_cluster(cc_in: schemas.CustomerClusterCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER"]))):
    # Verify transformer exists
    tx = db.query(models.Transformer).filter(models.Transformer.id == cc_in.transformer_id).first()
    if not tx:
        raise HTTPException(status_code=400, detail="Transformer does not exist")
        
    db_cc = models.CustomerCluster(**cc_in.dict())
    if cc_in.polygon_coordinates:
        db_cc.geometry = coords_to_wkt_polygon(cc_in.polygon_coordinates)
        
    db.add(db_cc)
    db.commit()
    db.refresh(db_cc)
    invalidate_grid_cache()
    return db_cc

@router.get("/customer-clusters/{cc_id}", response_model=schemas.CustomerClusterResponse)
def get_customer_cluster(cc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_cc = db.query(models.CustomerCluster).filter(models.CustomerCluster.id == cc_id).first()
    if not db_cc:
        raise HTTPException(status_code=404, detail="Customer cluster not found")
    return db_cc

@router.put("/customer-clusters/{cc_id}", response_model=schemas.CustomerClusterResponse)
def update_customer_cluster(cc_id: int, cc_in: schemas.CustomerClusterUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER"]))):
    db_cc = db.query(models.CustomerCluster).filter(models.CustomerCluster.id == cc_id).first()
    if not db_cc:
        raise HTTPException(status_code=404, detail="Customer cluster not found")
    
    update_data = cc_in.dict(exclude_unset=True)
    
    if "transformer_id" in update_data:
        tx = db.query(models.Transformer).filter(models.Transformer.id == update_data["transformer_id"]).first()
        if not tx:
            raise HTTPException(status_code=400, detail="Transformer does not exist")
            
    for key, value in update_data.items():
        setattr(db_cc, key, value)
        
    if "polygon_coordinates" in update_data and update_data["polygon_coordinates"]:
        db_cc.geometry = coords_to_wkt_polygon(update_data["polygon_coordinates"])
        
    db.commit()
    db.refresh(db_cc)
    invalidate_grid_cache()
    return db_cc

@router.delete("/customer-clusters/{cc_id}")
def delete_customer_cluster(cc_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN"]))):
    db_cc = db.query(models.CustomerCluster).filter(models.CustomerCluster.id == cc_id).first()
    if not db_cc:
        raise HTTPException(status_code=404, detail="Customer cluster not found")
    db.delete(db_cc)
    db.commit()
    invalidate_grid_cache()
    return {"message": "Customer cluster deleted successfully"}
