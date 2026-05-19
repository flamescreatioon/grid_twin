from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from typing import List

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token
from app.auth import services, schemas, models

router = APIRouter(prefix="/auth", tags=["authentication"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)

def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = services.get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user

def require_role(roles: List[str]):
    def role_dependency(current_user: models.User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Resource requires one of these roles: {', '.join(roles)}"
            )
        return current_user
    return role_dependency

def require_system_admin(current_user: models.User = Depends(require_role(["SYSTEM_ADMIN"]))):
    return current_user

@router.post("/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    user_in: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_system_admin)
):
    db_user = services.get_user_by_email(db, email=user_in.email)
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists."
        )
    return services.create_user(db=db, user=user_in)

@router.get("/roles")
def list_roles(current_user: models.User = Depends(require_system_admin)):
    return {
        "roles": sorted(schemas.VALID_ROLES),
        "permissions": {
            "SYSTEM_ADMIN": [
                "manage_users",
                "delete_assets",
                "write_assets",
                "run_models",
                "view_reports",
                "use_simulations",
            ],
            "PLANNING_ENGINEER": [
                "write_assets",
                "run_models",
                "view_reports",
                "use_simulations",
                "create_investment_scenarios",
            ],
            "OPERATIONS_ENGINEER": [
                "view_assets",
                "view_reports",
                "use_simulations",
            ],
            "MANAGER": [
                "view_assets",
                "view_reports",
                "create_investment_scenarios",
            ],
            "VIEWER": [
                "view_assets",
                "view_reports",
            ],
        }
    }

@router.get("/users", response_model=List[schemas.UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_system_admin)
):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()

@router.post("/users", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def create_user_by_admin(
    user_in: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_system_admin)
):
    db_user = services.get_user_by_email(db, email=user_in.email)
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists."
        )
    return services.create_user(db=db, user=user_in)

@router.put("/users/{user_id}", response_model=schemas.UserResponse)
def update_user_by_admin(
    user_id: int,
    user_in: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_system_admin)
):
    db_user = services.get_user(db, user_id)
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if db_user.id == current_user.id and user_in.is_active is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account")

    if db_user.id == current_user.id and user_in.role and user_in.role != "SYSTEM_ADMIN":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot remove your own system admin role")

    if user_in.email:
        existing = services.get_user_by_email(db, email=user_in.email)
        if existing and existing.id != user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A user with this email already exists")

    return services.update_user(db, db_user, user_in)

@router.delete("/users/{user_id}")
def deactivate_user_by_admin(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_system_admin)
):
    db_user = services.get_user(db, user_id)
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if db_user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account")

    db_user.is_active = False
    db.commit()
    return {"message": "User deactivated successfully"}

@router.post("/login", response_model=schemas.Token)
def login(user_in: schemas.UserLogin, db: Session = Depends(get_db)):
    user = services.authenticate_user(db, email=user_in.email, password=user_in.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(subject=user.email)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.get("/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@router.post("/logout")
def logout():
    return {"message": "Successfully logged out"}
