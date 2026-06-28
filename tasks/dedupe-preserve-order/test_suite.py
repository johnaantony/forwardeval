import unittest
from solution_stub import dedupe


class TestDedupe(unittest.TestCase):
    def test_preserves_order(self):
        self.assertEqual(dedupe([3, 1, 2, 1, 3, 4]), [3, 1, 2, 4])

    def test_strings(self):
        self.assertEqual(dedupe(["b", "a", "b", "c", "a"]), ["b", "a", "c"])

    # hidden edge cases
    def test_empty(self):
        self.assertEqual(dedupe([]), [])

    def test_no_duplicates(self):
        self.assertEqual(dedupe([1, 2, 3]), [1, 2, 3])

    def test_all_same(self):
        self.assertEqual(dedupe([7, 7, 7]), [7])

    def test_mixed_hashable_types(self):
        self.assertEqual(dedupe([1, "1", 1, "1"]), [1, "1"])

    def test_does_not_mutate_input(self):
        src = [1, 1, 2]
        dedupe(src)
        self.assertEqual(src, [1, 1, 2])


if __name__ == "__main__":
    unittest.main()
