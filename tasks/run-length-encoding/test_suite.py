import unittest
from solution_stub import encode


class TestEncode(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(encode("aaabbc"), "a3b2c1")

    def test_single_char(self):
        self.assertEqual(encode("a"), "a1")

    # hidden: the dropped-final-run bug shows up everywhere
    def test_all_distinct(self):
        self.assertEqual(encode("abc"), "a1b1c1")

    def test_one_long_run(self):
        self.assertEqual(encode("aaaa"), "a4")

    def test_alternating(self):
        self.assertEqual(encode("aabbaa"), "a2b2a2")

    def test_empty(self):
        self.assertEqual(encode(""), "")

    def test_trailing_run_length(self):
        self.assertEqual(encode("abbbb"), "a1b4")


if __name__ == "__main__":
    unittest.main()
