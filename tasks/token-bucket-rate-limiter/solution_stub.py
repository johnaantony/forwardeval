class RateLimiter:
    def __init__(self, capacity, refill_rate):
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = capacity

    def allow(self, timestamp):
        # BUG: never refills tokens based on elapsed time.
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False
