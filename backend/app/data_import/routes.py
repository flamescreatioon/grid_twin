from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import csv
import io
import json

from app.core.database import get_db
from app.auth.routes import get_current_user, require_role
from app.auth.models import User
from app.data_import import validation
from app.assets import models
from app.core.cache import invalidate_grid_cache

router = APIRouter(prefix="/assets/import", tags=["data-import"])

# In-memory store for import history jobs
import_jobs_log: List[Dict[str, Any]] = []

@router.post("/csv")
def import_csv(
    asset_type: str, 
    file: UploadFile = File(...), 
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_role(["SYSTEM_ADMIN", "PLANNING_ENGINEER"]))
):
    """
    Ingests utility data from a CSV file, runs it through the quality validation engine, 
    inserts valid rows, and records the quality metrics.
    """
    if asset_type not in ["substation", "transformer"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV import is supported only for 'substation' and 'transformer' in MVP."
        )
        
    try:
        contents = file.file.read().decode("utf-8")
        reader = csv.DictReader(io.StringIO(contents))
        records = [row for row in reader]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse CSV file: {str(e)}"
        )
        
    if not records:
        raise HTTPException(status_code=400, detail="CSV file is empty")
        
    # Execute validation and database seeding
    if asset_type == "substation":
        report = validation.validate_substations_import(records, db)
        if report["valid_records_count"] > 0:
            for rec in report["valid_records"]:
                db_sub = models.Substation(
                    name=rec["name"],
                    code=rec["code"],
                    voltage_level=rec["voltage_level"],
                    capacity_mva=float(rec["capacity_mva"]),
                    latitude=float(rec["latitude"]) if rec.get("latitude") else None,
                    longitude=float(rec["longitude"]) if rec.get("longitude") else None,
                    status=rec.get("status", "operational"),
                    district=rec.get("district")
                )
                if db_sub.longitude is not None and db_sub.latitude is not None:
                    db_sub.location = f"POINT({db_sub.longitude} {db_sub.latitude})"
                db.add(db_sub)
            db.commit()
            invalidate_grid_cache()
            
    elif asset_type == "transformer":
        report = validation.validate_transformers_import(records, db)
        if report["valid_records_count"] > 0:
            for rec in report["valid_records"]:
                db_tx = models.Transformer(
                    name=rec["name"],
                    code=rec["code"],
                    feeder_id=rec["feeder_id"],
                    rating_kva=float(rec["rating_kva"]),
                    latitude=float(rec["latitude"]) if rec.get("latitude") else None,
                    longitude=float(rec["longitude"]) if rec.get("longitude") else None,
                    customer_count=int(rec.get("customer_count", 0)),
                    peak_load_kva=float(rec.get("peak_load_kva", 0.0)),
                    loading_percentage=float(rec.get("loading_percentage", 0.0)),
                    status=rec.get("status", "operational"),
                    installation_year=int(rec["installation_year"]) if rec.get("installation_year") else None
                )
                if db_tx.longitude is not None and db_tx.latitude is not None:
                    db_tx.location = f"POINT({db_tx.longitude} {db_tx.latitude})"
                db.add(db_tx)
            db.commit()
            invalidate_grid_cache()
            
    # Save validation job to log
    job_id = len(import_jobs_log) + 1
    job_record = {
        "id": job_id,
        "filename": file.filename,
        "asset_type": asset_type,
        "total_records": report["total_records_processed"],
        "valid_count": report["valid_records_count"],
        "invalid_count": report["invalid_records_count"],
        "quality_score": report["data_quality_score"],
        "status": "completed" if report["invalid_records_count"] == 0 else "completed_with_warnings",
        "errors": report["errors"]
    }
    import_jobs_log.append(job_record)
    
    return job_record

@router.get("/jobs", response_model=List[Dict[str, Any]])
def get_import_jobs(current_user: User = Depends(get_current_user)):
    """
    Returns the log history of all data imports.
    """
    return import_jobs_log

@router.get("/jobs/{job_id}", response_model=Dict[str, Any])
def get_import_job_detail(job_id: int, current_user: User = Depends(get_current_user)):
    """
    Get detailed logs for a specific import job, including validation errors.
    """
    for job in import_jobs_log:
        if job["id"] == job_id:
            return job
    raise HTTPException(status_code=404, detail="Import job log not found")
