import unittest
from solution_stub import merge


class TestMerge(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(
            merge([[1, 3], [2, 6], [8, 10], [15, 18]]),
            [[1, 6], [8, 10], [15, 18]],
        )

    def test_touching(self):
        self.assertEqual(merge([[1, 4], [4, 5]]), [[1, 5]])

    # the bug: unsorted input
    def test_unsorted(self):
        self.assertEqual(merge([[2, 3], [1, 5], [6, 7], [0, 1]]), [[0, 5], [6, 7]])

    def test_unsorted_overlap(self):
        self.assertEqual(merge([[1, 4], [0, 4]]), [[0, 4]])

    # hidden edge cases
    def test_contained(self):
        self.assertEqual(merge([[1, 6], [2, 3]]), [[1, 6]])

    def test_disjoint(self):
        self.assertEqual(merge([[1, 2], [5, 6]]), [[1, 2], [5, 6]])

    def test_empty(self):
        self.assertEqual(merge([]), [])

    def test_single(self):
        self.assertEqual(merge([[3, 4]]), [[3, 4]])


if __name__ == "__main__":
    unittest.main()
