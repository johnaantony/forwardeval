import unittest
from solution_stub import RateLimiter


class TestRateLimiter(unittest.TestCase):
    def test_starts_full(self):
        rl = RateLimiter(2, 1)
        self.assertTrue(rl.allow(0))
        self.assertTrue(rl.allow(0))

    def test_empties(self):
        rl = RateLimiter(2, 1)
        rl.allow(0)
        rl.allow(0)
        self.assertFalse(rl.allow(0))

    # the bug: refill over elapsed time
    def test_refills_over_time(self):
        rl = RateLimiter(2, 1)
        rl.allow(0)
        rl.allow(0)
        self.assertFalse(rl.allow(0))
        self.assertTrue(rl.allow(1))  # 1 second -> +1 token

    def test_refill_capped_at_capacity(self):
        rl = RateLimiter(2, 1)
        rl.allow(0)
        rl.allow(0)
        # large gap refills, but never beyond capacity (2)
        self.assertTrue(rl.allow(100))
        self.assertTrue(rl.allow(100))
        self.assertFalse(rl.allow(100))

    # hidden: full sequence
    def test_sequence(self):
        rl = RateLimiter(2, 1)
        self.assertTrue(rl.allow(0))
        self.assertTrue(rl.allow(0))
        self.assertFalse(rl.allow(0))
        self.assertTrue(rl.allow(1))
        self.assertFalse(rl.allow(1))
        self.assertTrue(rl.allow(3))
        self.assertTrue(rl.allow(3))
        self.assertFalse(rl.allow(3))


if __name__ == "__main__":
    unittest.main()
