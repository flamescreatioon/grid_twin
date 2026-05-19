from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.auth.routes import get_current_user, require_role
from app.auth.models import User
from app.topology import graph_builder
from app.core.cache import cache

router = APIRouter(prefix="/topology", tags=["topology"])

@router.post("/build")
def rebuild_topology(db: Session = Depends(get_db), current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER"]))):
    """
    Forces rebuilding and validating the network graph.
    """
    # Invalidate cached graph and maps
    cache.invalidate_prefix("topology")
    cache.invalidate_prefix("gis")
    
    G = graph_builder.build_network_graph(db)
    return {
        "status": "success",
        "message": "Topology graph rebuilt successfully",
        "node_count": G.number_of_nodes(),
        "edge_count": G.number_of_edges()
    }

@router.get("/feeder/{feeder_id}")
def trace_feeder(feeder_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Get full topology structure for a specific feeder, including connected transformers and customer clusters.
    """
    G = graph_builder.build_network_graph(db)
    subgraph = graph_builder.get_feeder_subgraph(G, feeder_id)
    if not subgraph["nodes"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Feeder {feeder_id} not found or contains no downstream assets"
        )
    return subgraph

@router.get("/transformer/{transformer_id}/upstream")
def trace_transformer_upstream(transformer_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Finds all upstream assets (feeder, substation) that supply a specific transformer.
    """
    G = graph_builder.build_network_graph(db)
    upstream = graph_builder.get_upstream_nodes(G, "transformer", transformer_id)
    if not upstream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Transformer {transformer_id} not found"
        )
    return upstream

@router.get("/asset/{asset_type}/{asset_id}/downstream")
def trace_downstream(asset_type: str, asset_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Traces downstream flow starting from any substation, feeder, or transformer.
    """
    valid_types = ["substation", "feeder", "transformer"]
    if asset_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Invalid asset type. Must be one of: {', '.join(valid_types)}"
        )
        
    G = graph_builder.build_network_graph(db)
    downstream = graph_builder.get_downstream_nodes(G, asset_type, asset_id)
    if not downstream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Asset {asset_type} with ID {asset_id} not found"
        )
    return downstream

@router.get("/trace/{asset_type}/{asset_id}")
def trace_asset(asset_type: str, asset_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Full tracing details for any asset: both upstream supply chain and downstream impact area.
    """
    valid_types = ["substation", "feeder", "transformer", "customer_cluster"]
    if asset_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Invalid asset type. Must be one of: {', '.join(valid_types)}"
        )
        
    G = graph_builder.build_network_graph(db)
    upstream = graph_builder.get_upstream_nodes(G, asset_type, asset_id)
    downstream = graph_builder.get_downstream_nodes(G, asset_type, asset_id)
    
    return {
        "upstream": upstream,
        "downstream": downstream
    }
