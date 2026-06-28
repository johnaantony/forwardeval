import unittest
from solution_stub import search


class TestSearch(unittest.TestCase):
    def test_found_middle(self):
        self.assertEqual(search([1, 3, 5, 7, 9], 5), 2)

    def test_found_first(self):
        self.assertEqual(search([1, 3, 5, 7, 9], 1), 0)

    # hidden: the off-by-one specifically breaks the LAST element
    def test_found_last(self):
        self.assertEqual(search([1, 3, 5, 7, 9], 9), 4)

    def test_single_element_found(self):
        self.assertEqual(search([42], 42), 0)

    def test_not_found(self):
        self.assertEqual(search([1, 3, 5, 7, 9], 4), -1)

    def test_empty(self):
        self.assertEqual(search([], 1), -1)

    def test_two_elements_last(self):
        self.assertEqual(search([1, 2], 2), 1)


if __name__ == "__main__":
    unittest.main()
