import os
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Union
from jose import jwt
from app.core.config import settings

HASH_ALGORITHM = 'sha256'

def get_password_hash(password: str) -> str:
    """
    Hashes a password using PBKDF2-SHA256 with a random 16-byte salt.
    Returns: "salt_hex.hash_hex"
    """
    salt = os.urandom(16)
    db_hash = hashlib.pbkdf2_hmac(
        HASH_ALGORITHM, 
        password.encode('utf-8'), 
        salt, 
        settings.PASSWORD_HASH_ITERATIONS
    )
    return f"pbkdf2_sha256${settings.PASSWORD_HASH_ITERATIONS}${salt.hex()}${db_hash.hex()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain password against the stored "salt_hex.hash_hex" hash.
    """
    try:
        if not hashed_password:
            return False

        if hashed_password.startswith("pbkdf2_sha256$"):
            _, iterations, salt_hex, hash_hex = hashed_password.split("$", 3)
            iterations = int(iterations)
        elif "." in hashed_password:
            salt_hex, hash_hex = hashed_password.split(".", 1)
            iterations = 100000
        else:
            return False

        salt = bytes.fromhex(salt_hex)
        db_hash = bytes.fromhex(hash_hex)
        
        test_hash = hashlib.pbkdf2_hmac(
            HASH_ALGORITHM, 
            plain_password.encode('utf-8'), 
            salt, 
            iterations
        )
        return hmac.compare_digest(test_hash, db_hash)
    except Exception:
        return False

def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "sub": str(subject),
        "jti": secrets.token_urlsafe(16)
    }
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt
