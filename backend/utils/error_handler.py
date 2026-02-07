"""Error handling utilities with retry logic for Nova APIs."""

import asyncio
import functools
import logging
from typing import Callable, TypeVar

logger = logging.getLogger("accessvoice.errors")

T = TypeVar("T")


async def retry_async(
    fn: Callable,
    max_retries: int = 2,
    delay: float = 1.0,
    backoff: float = 2.0,
    on_retry: Callable[[int, Exception], None] | None = None,
):
    """Retry an async function with exponential backoff.

    Args:
        fn: Async callable to retry
        max_retries: Maximum number of retry attempts
        delay: Initial delay between retries in seconds
        backoff: Multiplier for delay after each retry
        on_retry: Optional callback(attempt, error) called before each retry
    """
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            return await fn()
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                if on_retry:
                    on_retry(attempt + 1, e)
                logger.warning(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay}s...")
                await asyncio.sleep(delay)
                delay *= backoff
            else:
                logger.error(f"All {max_retries + 1} attempts failed: {e}")
    raise last_error


def safe_cleanup(fn: Callable) -> Callable:
    """Decorator that catches and logs exceptions during cleanup operations."""
    @functools.wraps(fn)
    async def wrapper(*args, **kwargs):
        try:
            return await fn(*args, **kwargs)
        except Exception as e:
            logger.error(f"Cleanup error in {fn.__name__}: {e}")
    return wrapper
