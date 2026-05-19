from sqlalchemy import create_engine, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Adjust connection arguments for SQLite if needed
if "sqlite" in settings.DATABASE_URL:
    engine = create_engine(
        settings.DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_geometry_type(geometry_type: str = "GEOMETRY", srid: int = 4326):
    """
    Dynamic geometry type helper that returns a GeoAlchemy2 Geometry type if running on PostgreSQL,
    or falls back to a standard SQLAlchemy Text column (for WKT or GeoJSON strings) on SQLite.
    """
    if "sqlite" in settings.DATABASE_URL:
        return Text
    else:
        try:
            from geoalchemy2 import Geometry
            return Geometry(geometry_type=geometry_type, srid=srid)
        except ImportError:
            return Text
