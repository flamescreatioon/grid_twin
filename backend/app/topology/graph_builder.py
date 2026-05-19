import networkx as nx
from sqlalchemy.orm import Session
from app.assets import models
from typing import Dict, List, Any, Tuple
from app.core.cache import cached

@cached(ttl_seconds=600, prefix="topology")
def build_network_graph(db: Session) -> nx.DiGraph:
    """
    Builds a NetworkX DiGraph representing the grid hierarchy:
    Substation -> Feeder -> Transformer -> CustomerCluster.
    """
    G = nx.DiGraph()
    
    # 1. Fetch and add substations
    substations = db.query(models.Substation).all()
    for sub in substations:
        node_id = f"substation_{sub.id}"
        G.add_node(
            node_id, 
            id=sub.id,
            type="substation", 
            name=sub.name, 
            code=sub.code,
            capacity_mva=sub.capacity_mva,
            status=sub.status
        )
        
    # 2. Fetch and add feeders, connecting them to substations
    feeders = db.query(models.Feeder).all()
    for fd in feeders:
        node_id = f"feeder_{fd.id}"
        G.add_node(
            node_id, 
            id=fd.id,
            type="feeder", 
            name=fd.name, 
            code=fd.code,
            rated_capacity_mw=fd.rated_capacity_mw,
            status=fd.status
        )
        sub_node = f"substation_{fd.source_substation_id}"
        if G.has_node(sub_node):
            G.add_edge(sub_node, node_id)
            
    # 3. Fetch and add transformers, connecting them to feeders
    transformers = db.query(models.Transformer).all()
    for tx in transformers:
        node_id = f"transformer_{tx.id}"
        G.add_node(
            node_id, 
            id=tx.id,
            type="transformer", 
            name=tx.name, 
            code=tx.code,
            rating_kva=tx.rating_kva,
            status=tx.status,
            customer_count=tx.customer_count
        )
        feeder_node = f"feeder_{tx.feeder_id}"
        if G.has_node(feeder_node):
            G.add_edge(feeder_node, node_id)
            
    # 4. Fetch and add customer clusters, connecting them to transformers
    clusters = db.query(models.CustomerCluster).all()
    for cc in clusters:
        node_id = f"customer_cluster_{cc.id}"
        G.add_node(
            node_id, 
            id=cc.id,
            type="customer_cluster", 
            name=cc.name,
            customer_count=cc.customer_count,
            estimated_demand_kw=cc.estimated_demand_kw
        )
        tx_node = f"transformer_{cc.transformer_id}"
        if G.has_node(tx_node):
            G.add_edge(tx_node, node_id)
            
    return G

def get_downstream_nodes(G: nx.DiGraph, asset_type: str, asset_id: int) -> List[Dict[str, Any]]:
    """
    Traces downstream from a node and returns all affected assets.
    """
    start_node = f"{asset_type}_{asset_id}"
    if not G.has_node(start_node):
        return []
        
    # Get all nodes reachable from the start node
    descendants = nx.descendants(G, start_node)
    
    results = []
    # Add start node itself
    results.append({**G.nodes[start_node], "node_id": start_node})
    
    for desc in descendants:
        results.append({**G.nodes[desc], "node_id": desc})
        
    return results

def get_upstream_nodes(G: nx.DiGraph, asset_type: str, asset_id: int) -> List[Dict[str, Any]]:
    """
    Traces upstream from a node to the root (substation).
    """
    start_node = f"{asset_type}_{asset_id}"
    if not G.has_node(start_node):
        return []
        
    # Get all ancestors
    ancestors = nx.ancestors(G, start_node)
    
    results = []
    # Add start node
    results.append({**G.nodes[start_node], "node_id": start_node})
    
    for anc in ancestors:
        results.append({**G.nodes[anc], "node_id": anc})
        
    return results

def get_feeder_subgraph(G: nx.DiGraph, feeder_id: int) -> Dict[str, Any]:
    """
    Traces a complete feeder tree: the feeder itself, all downstream transformers, and customer clusters.
    """
    feeder_node = f"feeder_{feeder_id}"
    if not G.has_node(feeder_node):
        return {"nodes": [], "edges": []}
        
    # Get downstream assets
    downstream = nx.descendants(G, feeder_node)
    nodes_to_keep = {feeder_node} | downstream
    
    # Create subgraph
    subg = G.subgraph(nodes_to_keep)
    
    nodes_data = []
    for n in subg.nodes:
        nodes_data.append({**subg.nodes[n], "node_id": n})
        
    edges_data = []
    for u, v in subg.edges:
        edges_data.append({"source": u, "target": v})
        
    return {"nodes": nodes_data, "edges": edges_data}
