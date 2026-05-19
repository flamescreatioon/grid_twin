from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.core.database import get_db
from app.auth.routes import get_current_user
from app.auth.models import User
from app.assets import models
from app.topology import graph_builder

router = APIRouter(prefix="/map", tags=["gis-map"])

# Helper to format a feature
def to_feature(geom_type: str, coords: Any, properties: Dict[str, Any], feature_id: int) -> Dict[str, Any]:
    return {
        "type": "Feature",
        "id": feature_id,
        "geometry": {
            "type": geom_type,
            "coordinates": coords
        },
        "properties": properties
    }

@router.get("/substations")
def get_substations_geojson(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Returns all substations in GeoJSON format.
    """
    subs = db.query(models.Substation).all()
    features = []
    for s in subs:
        if s.longitude is not None and s.latitude is not None:
            features.append(to_feature(
                geom_type="Point",
                coords=[s.longitude, s.latitude],
                properties={
                    "id": s.id,
                    "name": s.name,
                    "code": s.code,
                    "voltage_level": s.voltage_level,
                    "capacity_mva": s.capacity_mva,
                    "status": s.status,
                    "district": s.district,
                    "asset_type": "substation"
                },
                feature_id=s.id
            ))
    return {"type": "FeatureCollection", "features": features}

@router.get("/feeders")
def get_feeders_geojson(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Returns all feeder lines in GeoJSON format.
    """
    feeders = db.query(models.Feeder).all()
    features = []
    for f in feeders:
        if f.route_coordinates:
            features.append(to_feature(
                geom_type="LineString",
                coords=f.route_coordinates,
                properties={
                    "id": f.id,
                    "name": f.name,
                    "code": f.code,
                    "voltage_level": f.voltage_level,
                    "source_substation_id": f.source_substation_id,
                    "peak_load_mw": f.peak_load_mw,
                    "rated_capacity_mw": f.rated_capacity_mw,
                    "risk_score": f.risk_score,
                    "status": f.status,
                    "asset_type": "feeder"
                },
                feature_id=f.id
            ))
    return {"type": "FeatureCollection", "features": features}

@router.get("/transformers")
def get_transformers_geojson(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Returns all transformers in GeoJSON format.
    """
    transformers = db.query(models.Transformer).all()
    features = []
    for t in transformers:
        if t.longitude is not None and t.latitude is not None:
            features.append(to_feature(
                geom_type="Point",
                coords=[t.longitude, t.latitude],
                properties={
                    "id": t.id,
                    "name": t.name,
                    "code": t.code,
                    "feeder_id": t.feeder_id,
                    "rating_kva": t.rating_kva,
                    "customer_count": t.customer_count,
                    "peak_load_kva": t.peak_load_kva,
                    "loading_percentage": t.loading_percentage,
                    "risk_score": t.risk_score,
                    "status": t.status,
                    "installation_year": t.installation_year,
                    "asset_type": "transformer"
                },
                feature_id=t.id
            ))
    return {"type": "FeatureCollection", "features": features}

@router.get("/customer-clusters")
def get_customer_clusters_geojson(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Returns all customer/load clusters in GeoJSON format.
    """
    clusters = db.query(models.CustomerCluster).all()
    features = []
    for c in clusters:
        if c.polygon_coordinates:
            features.append(to_feature(
                geom_type="Polygon",
                coords=c.polygon_coordinates,
                properties={
                    "id": c.id,
                    "name": c.name,
                    "transformer_id": c.transformer_id,
                    "customer_count": c.customer_count,
                    "tariff_mix": c.tariff_mix,
                    "estimated_demand_kw": c.estimated_demand_kw,
                    "asset_type": "customer_cluster"
                },
                feature_id=c.id
            ))
    return {"type": "FeatureCollection", "features": features}

@router.get("/risk-heatmap")
def get_risk_heatmap_geojson(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Returns transformers formatted as weight points for a risk-based GIS heatmap.
    """
    transformers = db.query(models.Transformer).all()
    features = []
    for t in transformers:
        if t.longitude is not None and t.latitude is not None:
            features.append(to_feature(
                geom_type="Point",
                coords=[t.longitude, t.latitude],
                properties={
                    "risk_score": t.risk_score,
                    "loading_pct": t.loading_percentage,
                    "intensity": t.risk_score / 100.0  # Normalized weight [0-1]
                },
                feature_id=t.id
            ))
    return {"type": "FeatureCollection", "features": features}

@router.get("/load-heatmap")
def get_load_heatmap_geojson(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Returns customer clusters as polygons with demand weight, plus transformers as load points.
    """
    transformers = db.query(models.Transformer).all()
    features = []
    for t in transformers:
        if t.longitude is not None and t.latitude is not None:
            features.append(to_feature(
                geom_type="Point",
                coords=[t.longitude, t.latitude],
                properties={
                    "loading_percentage": t.loading_percentage,
                    "intensity": min(1.0, t.loading_percentage / 100.0)
                },
                feature_id=t.id
            ))
    return {"type": "FeatureCollection", "features": features}

@router.get("/outage-zones")
def get_outage_zones_geojson(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Looks up active outage events and compiles a GeoJSON FeatureCollection of affected 
    polygons (customer service areas) and lines (feeder routes) representing blackout zones.
    """
    active_outages = db.query(models.OutageEvent).filter(models.OutageEvent.status == "active").all()
    G = graph_builder.build_network_graph(db)
    
    features = []
    for outage in active_outages:
        # Trace affected downstream nodes
        downstream = graph_builder.get_downstream_nodes(G, outage.affected_asset_type, outage.affected_asset_id)
        
        for node in downstream:
            n_type = node["type"]
            n_id = node["id"]
            
            if n_type == "customer_cluster":
                cc = db.query(models.CustomerCluster).filter(models.CustomerCluster.id == n_id).first()
                if cc and cc.polygon_coordinates:
                    features.append(to_feature(
                        geom_type="Polygon",
                        coords=cc.polygon_coordinates,
                        properties={
                            "outage_id": outage.id,
                            "cause": outage.cause,
                            "asset_id": cc.id,
                            "asset_type": "customer_cluster",
                            "name": cc.name,
                            "type": "outage_polygon"
                        },
                        feature_id=len(features) + 1
                    ))
            elif n_type == "feeder":
                fd = db.query(models.Feeder).filter(models.Feeder.id == n_id).first()
                if fd and fd.route_coordinates:
                    features.append(to_feature(
                        geom_type="LineString",
                        coords=fd.route_coordinates,
                        properties={
                            "outage_id": outage.id,
                            "cause": outage.cause,
                            "asset_id": fd.id,
                            "asset_type": "feeder",
                            "name": fd.name,
                            "type": "outage_line"
                        },
                        feature_id=len(features) + 1
                    ))
    return {"type": "FeatureCollection", "features": features}

@router.get("/asset/{asset_type}/{asset_id}")
def get_single_asset_geojson(asset_type: str, asset_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Returns a single asset formatted as a GeoJSON Feature for focus mapping.
    """
    if asset_type == "substation":
        a = db.query(models.Substation).filter(models.Substation.id == asset_id).first()
        if a and a.longitude is not None:
            return to_feature("Point", [a.longitude, a.latitude], {"name": a.name, "code": a.code, "type": "substation"}, a.id)
    elif asset_type == "feeder":
        a = db.query(models.Feeder).filter(models.Feeder.id == asset_id).first()
        if a and a.route_coordinates:
            return to_feature("LineString", a.route_coordinates, {"name": a.name, "code": a.code, "type": "feeder"}, a.id)
    elif asset_type == "transformer":
        a = db.query(models.Transformer).filter(models.Transformer.id == asset_id).first()
        if a and a.longitude is not None:
            return to_feature("Point", [a.longitude, a.latitude], {"name": a.name, "code": a.code, "type": "transformer"}, a.id)
    elif asset_type == "customer_cluster":
        a = db.query(models.CustomerCluster).filter(models.CustomerCluster.id == asset_id).first()
        if a and a.polygon_coordinates:
            return to_feature("Polygon", a.polygon_coordinates, {"name": a.name, "type": "customer_cluster"}, a.id)
            
    raise HTTPException(status_code=404, detail="Asset geographical data not found")
