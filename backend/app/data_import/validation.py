from typing import Dict, List, Any
from sqlalchemy.orm import Session
from app.assets import models

def validate_substations_import(records: List[Dict[str, Any]], db: Session) -> Dict[str, Any]:
    """
    Validates substation import records.
    """
    errors = []
    valid_records = []
    duplicate_codes = set()
    
    # Get existing codes to check duplication
    existing_codes = {s.code for s in db.query(models.Substation.code).all()}
    
    for idx, rec in enumerate(records):
        rec_errors = []
        code = rec.get("code")
        name = rec.get("name")
        lat = rec.get("latitude")
        lon = rec.get("longitude")
        capacity = rec.get("capacity_mva")
        voltage = rec.get("voltage_level")
        
        # 1. Check basic identifiers
        if not code:
            rec_errors.append("Missing asset code")
        elif code in existing_codes or code in duplicate_codes:
            rec_errors.append(f"Duplicate asset code: '{code}'")
        else:
            duplicate_codes.add(code)
            
        if not name:
            rec_errors.append("Missing name")
            
        # 2. Check coordinates
        try:
            lat_f = float(lat) if lat is not None else None
            lon_f = float(lon) if lon is not None else None
            if lat_f is None or lon_f is None:
                rec_errors.append("Missing spatial coordinates")
            elif not (-90 <= lat_f <= 90) or not (-180 <= lon_f <= 180):
                rec_errors.append(f"Invalid coordinate bounds: lat={lat}, lon={lon}")
        except ValueError:
            rec_errors.append(f"Non-numeric coordinates: lat={lat}, lon={lon}")
            
        # 3. Check capacity rating
        try:
            cap_f = float(capacity) if capacity is not None else None
            if cap_f is None or cap_f <= 0:
                rec_errors.append(f"Invalid capacity rating: '{capacity}' MVA. Must be > 0.")
        except ValueError:
            rec_errors.append(f"Non-numeric capacity: '{capacity}'")
            
        # 4. Check voltage
        if not voltage:
            rec_errors.append("Missing voltage level (e.g. '33kV')")
            
        if rec_errors:
            errors.append({"record_index": idx, "code": code or f"ROW_{idx}", "errors": rec_errors})
        else:
            valid_records.append(rec)
            
    total = len(records)
    error_count = len(errors)
    quality_score = round(100.0 * (1.0 - (error_count / max(1, total))), 1)
    
    return {
        "total_records_processed": total,
        "valid_records_count": len(valid_records),
        "invalid_records_count": error_count,
        "data_quality_score": quality_score,
        "errors": errors,
        "valid_records": valid_records
    }

def validate_transformers_import(records: List[Dict[str, Any]], db: Session) -> Dict[str, Any]:
    """
    Validates transformer import records.
    """
    errors = []
    valid_records = []
    duplicate_codes = set()
    
    # Get existing codes
    existing_codes = {t.code for t in db.query(models.Transformer.code).all()}
    
    # Get existing feeders for relational integrity check
    existing_feeder_ids = {f.id for f in db.query(models.Feeder.id).all()}
    existing_feeder_codes = {f.code: f.id for f in db.query(models.Feeder).all()}
    
    for idx, rec in enumerate(records):
        rec_errors = []
        code = rec.get("code")
        name = rec.get("name")
        feeder_code = rec.get("feeder_code")
        feeder_id = rec.get("feeder_id")
        rating = rec.get("rating_kva")
        lat = rec.get("latitude")
        lon = rec.get("longitude")
        
        # 1. Identifiers
        if not code:
            rec_errors.append("Missing asset code")
        elif code in existing_codes or code in duplicate_codes:
            rec_errors.append(f"Duplicate asset code: '{code}'")
        else:
            duplicate_codes.add(code)
            
        if not name:
            rec_errors.append("Missing name")
            
        # 2. Relational integrity (Feeder reference)
        resolved_feeder_id = None
        if feeder_id is not None:
            try:
                f_id = int(feeder_id)
                if f_id in existing_feeder_ids:
                    resolved_feeder_id = f_id
                else:
                    rec_errors.append(f"Referenced feeder ID {f_id} does not exist in DB")
            except ValueError:
                rec_errors.append(f"Invalid non-integer feeder ID: {feeder_id}")
        elif feeder_code:
            if feeder_code in existing_feeder_codes:
                resolved_feeder_id = existing_feeder_codes[feeder_code]
            else:
                rec_errors.append(f"Referenced feeder code '{feeder_code}' does not exist in DB")
        else:
            rec_errors.append("Missing feeder link (specify feeder_id or feeder_code)")
            
        # 3. Spatial
        try:
            lat_f = float(lat) if lat is not None else None
            lon_f = float(lon) if lon is not None else None
            if lat_f is None or lon_f is None:
                rec_errors.append("Missing spatial coordinates")
            elif not (-90 <= lat_f <= 90) or not (-180 <= lon_f <= 180):
                rec_errors.append(f"Invalid coordinates: lat={lat}, lon={lon}")
        except ValueError:
            rec_errors.append(f"Non-numeric coordinates: lat={lat}, lon={lon}")
            
        # 4. Rating
        try:
            rating_f = float(rating) if rating is not None else None
            if rating_f is None or rating_f <= 0:
                rec_errors.append(f"Invalid rating: '{rating}' kVA. Must be > 0.")
        except ValueError:
            rec_errors.append(f"Non-numeric rating: '{rating}'")
            
        if rec_errors:
            errors.append({"record_index": idx, "code": code or f"ROW_{idx}", "errors": rec_errors})
        else:
            # Map resolved feeder ID back to record
            rec["feeder_id"] = resolved_feeder_id
            valid_records.append(rec)
            
    total = len(records)
    error_count = len(errors)
    quality_score = round(100.0 * (1.0 - (error_count / max(1, total))), 1)
    
    return {
        "total_records_processed": total,
        "valid_records_count": len(valid_records),
        "invalid_records_count": error_count,
        "data_quality_score": quality_score,
        "errors": errors,
        "valid_records": valid_records
    }
