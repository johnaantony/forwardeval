import unittest
from solution_stub import flatten


class TestFlatten(unittest.TestCase):
    def test_one_level(self):
        self.assertEqual(flatten([1, [2, 3], 4]), [1, 2, 3, 4])

    def test_two_levels(self):
        self.assertEqual(flatten([1, [2, [3, 4], 5]]), [1, 2, 3, 4, 5])

    def test_deep(self):
        self.assertEqual(flatten([1, [2, [3, [4, [5]]]]]), [1, 2, 3, 4, 5])

    # hidden edge cases
    def test_empty(self):
        self.assertEqual(flatten([]), [])

    def test_inner_empty_lists(self):
        self.assertEqual(flatten([1, [], [2, []], 3]), [1, 2, 3])

    def test_strings_atomic(self):
        self.assertEqual(flatten(["a", ["b", ["c"]]]), ["a", "b", "c"])

    def test_all_nested(self):
        self.assertEqual(flatten([[[[1]]]]), [1])


if __name__ == "__main__":
    unittest.main()
