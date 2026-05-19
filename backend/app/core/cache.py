import functools
import time
import logging
from typing import Any, Callable, Dict, Optional, Tuple
from threading import Lock

logger = logging.getLogger("cache")

class InMemoryCache:
    def __init__(self):
        self._cache: Dict[str, Tuple[Any, float]] = {}
        self._lock = Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._cache:
                return None
            val, expires_at = self._cache[key]
            if time.time() > expires_at:
                del self._cache[key]
                return None
            return val

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        with self._lock:
            expires_at = time.time() + ttl_seconds
            self._cache[key] = (value, expires_at)

    def delete(self, key: str) -> None:
        with self._lock:
            if key in self._cache:
                del self._cache[key]

    def invalidate_prefix(self, prefix: str) -> None:
        with self._lock:
            keys_to_delete = [k for k in self._cache.keys() if k.startswith(prefix)]
            for k in keys_to_delete:
                del self._cache[k]
            if keys_to_delete:
                logger.info(f"Invalidated {len(keys_to_delete)} cache entries starting with prefix: '{prefix}'")

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
            logger.info("Cleared all cache entries")

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            now = time.time()
            live_keys = [key for key, (_, expires_at) in self._cache.items() if expires_at > now]
            return {
                "entries": len(live_keys),
                "prefixes": sorted({key.split(":", 1)[0] for key in live_keys})
            }

# Global Cache Instance
cache = InMemoryCache()

def invalidate_grid_cache() -> None:
    """
    Clear cached derived grid views after registry mutations.
    """
    cache.invalidate_prefix("topology")
    cache.invalidate_prefix("gis")
    cache.invalidate_prefix("risk")
    cache.invalidate_prefix("forecast")
    cache.invalidate_prefix("reliability")

def make_cache_key(prefix: str, func: Callable, args: tuple, kwargs: dict) -> str:
    # Build a stable key from arguments
    arg_parts = [str(arg) for arg in args if not str(arg).startswith("<sqlalchemy.orm.session.Session")]
    kwarg_parts = [f"{k}={v}" for k, v in sorted(kwargs.items()) if not str(v).startswith("<sqlalchemy.orm.session.Session")]
    key_suffix = ":".join(arg_parts + kwarg_parts)
    return f"{prefix}:{func.__module__}.{func.__name__}:{key_suffix}"

def cached(ttl_seconds: int = 300, prefix: str = "default"):
    """
    Decorator to cache the results of a function.
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            key = make_cache_key(prefix, func, args, kwargs)
            cached_value = cache.get(key)
            if cached_value is not None:
                logger.debug(f"Cache hit: {key}")
                return cached_value
            
            logger.debug(f"Cache miss: {key}")
            value = func(*args, **kwargs)
            cache.set(key, value, ttl_seconds)
            return value
        return wrapper
    return decorator
