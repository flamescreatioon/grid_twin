from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import engine, Base, get_db
from app.core.seed import seed_database
from app.core.middleware import RequestLimitMiddleware, SecurityHeadersMiddleware

# Import routers
from app.auth import routes as auth_routes
from app.assets import routes as asset_routes
from app.topology import routes as topology_routes
from app.simulations import routes as simulation_routes
from app.risk import routes as risk_routes
from app.forecasting import routes as forecasting_routes
from app.gis import routes as gis_routes
from app.data_import import routes as data_import_routes
from app.reports import routes as reports_routes
from app.reliability import routes as reliability_routes
from app.alerts import routes as alerts_routes

# 1. Initialize database tables (SQLite fallback / Postgres automatic build)
Base.metadata.create_all(bind=engine)

# 2. Seed database on module import/run
db = next(get_db())
try:
    seed_database(db)
finally:
    db.close()

# 3. Create FastAPI Instance
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Digital Twin Platform for Electricity Distribution Network Planning & Investment Optimization (MVP Pilot GK2)",
    version="1.0.0",
    docs_url=f"{settings.API_V1_STR}/docs",
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# 4. Configure CORS Middleware
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_origin_regex=settings.BACKEND_CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 5. Register APIRouters
app.include_router(auth_routes.router, prefix=settings.API_V1_STR)
app.include_router(asset_routes.router, prefix=settings.API_V1_STR)
app.include_router(topology_routes.router, prefix=settings.API_V1_STR)
app.include_router(simulation_routes.router, prefix=settings.API_V1_STR)
app.include_router(risk_routes.router, prefix=settings.API_V1_STR)
app.include_router(forecasting_routes.router, prefix=settings.API_V1_STR)
app.include_router(gis_routes.router, prefix=settings.API_V1_STR)
app.include_router(data_import_routes.router, prefix=settings.API_V1_STR)
app.include_router(reports_routes.router, prefix=settings.API_V1_STR)
app.include_router(reliability_routes.router, prefix=settings.API_V1_STR)
app.include_router(alerts_routes.router, prefix=settings.API_V1_STR)

# 6. Basic Status Healthcheck
@app.get("/")
def read_root():
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "pilot_area": "Abuja Garki 2 (GK2)",
        "api_documentation": f"{settings.API_V1_STR}/docs"
    }
