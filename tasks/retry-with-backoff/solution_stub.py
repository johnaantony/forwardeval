import time


def retry(fn, attempts=3, base_delay=1.0, sleep=None):
    # First pass from the session: retries, but with a FIXED delay instead of
    # exponential backoff, and swallows the final exception by returning None.
    if sleep is None:
        sleep = time.sleep
    for _ in range(attempts):
        try:
            return fn()
        except Exception:
            sleep(base_delay)
    return None
