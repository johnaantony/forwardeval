import time


def retry(fn, attempts=3, base_delay=1.0, sleep=None):
    if sleep is None:
        sleep = time.sleep
    last_exc = None
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - deliberate: retry any failure
            last_exc = exc
            if attempt < attempts - 1:
                sleep(base_delay * 2 ** attempt)
    raise last_exc
