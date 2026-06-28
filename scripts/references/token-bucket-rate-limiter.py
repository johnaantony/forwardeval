class RateLimiter:
    def __init__(self, capacity, refill_rate):
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = float(capacity)
        self.last = None

    def allow(self, timestamp):
        if self.last is None:
            self.last = timestamp
        else:
            elapsed = timestamp - self.last
            self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
            self.last = timestamp
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False
