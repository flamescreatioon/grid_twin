from typing import List
from pydantic_settings import BaseSettings
from pydantic import field_validator, model_validator

class Settings(BaseSettings):
    PROJECT_NAME: str = "GridTwin Nigeria"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # JWT Authentication
    JWT_SECRET_KEY: str = "gridtwin_dev_secret_key_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days
    PASSWORD_HASH_ITERATIONS: int = 210000

    # Database
    DATABASE_URL: str = "sqlite:///./gridtwin.db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Runtime protection
    MAX_REQUEST_BODY_BYTES: int = 10 * 1024 * 1024
    API_RATE_LIMIT_PER_MINUTE: int = 240
    AUTH_RATE_LIMIT_PER_MINUTE: int = 10

    # CORS Origins
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    BACKEND_CORS_ORIGIN_REGEX: str = r"^http://(localhost|127\.0\.0\.1):\d+$"

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def validate_production_security(self):
        if self.ENVIRONMENT.lower() == "production":
            if self.JWT_SECRET_KEY == "gridtwin_dev_secret_key_change_in_production":
                raise ValueError("JWT_SECRET_KEY must be changed in production")
            if self.BACKEND_CORS_ORIGIN_REGEX:
                raise ValueError("BACKEND_CORS_ORIGIN_REGEX should be disabled or strictly scoped in production")
        return self

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
