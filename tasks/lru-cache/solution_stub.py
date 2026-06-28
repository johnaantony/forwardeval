class LRUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self.store = {}

    def get(self, key):
        # BUG: does not refresh recency on access.
        return self.store.get(key, -1)

    def put(self, key, value):
        if key not in self.store and len(self.store) >= self.capacity:
            # BUG: evicts the first-inserted key (FIFO), not the LRU.
            oldest = next(iter(self.store))
            del self.store[oldest]
        self.store[key] = value
