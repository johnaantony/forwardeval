import unittest
from solution_stub import LRUCache


class TestLRU(unittest.TestCase):
    def test_basic_get_put(self):
        c = LRUCache(2)
        c.put(1, 1)
        c.put(2, 2)
        self.assertEqual(c.get(1), 1)
        self.assertEqual(c.get(2), 2)

    def test_missing_returns_minus_one(self):
        c = LRUCache(2)
        self.assertEqual(c.get(99), -1)

    # the bug: get must refresh recency so the OTHER key is evicted
    def test_get_refreshes_recency(self):
        c = LRUCache(2)
        c.put(1, 1)
        c.put(2, 2)
        self.assertEqual(c.get(1), 1)  # 1 is now most-recently-used
        c.put(3, 3)  # evicts 2 (the LRU), not 1
        self.assertEqual(c.get(2), -1)
        self.assertEqual(c.get(1), 1)
        self.assertEqual(c.get(3), 3)

    # the bug: updating an existing key refreshes recency
    def test_update_refreshes_recency(self):
        c = LRUCache(2)
        c.put(1, 1)
        c.put(2, 2)
        c.put(1, 10)  # update -> 1 is most-recently-used
        c.put(3, 3)  # evicts 2
        self.assertEqual(c.get(2), -1)
        self.assertEqual(c.get(1), 10)
        self.assertEqual(c.get(3), 3)

    # hidden: capacity 1 + chained eviction
    def test_capacity_one(self):
        c = LRUCache(1)
        c.put(1, 1)
        c.put(2, 2)
        self.assertEqual(c.get(1), -1)
        self.assertEqual(c.get(2), 2)


if __name__ == "__main__":
    unittest.main()
