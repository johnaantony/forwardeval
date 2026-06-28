import unittest
from solution_stub import is_balanced


class TestBalanced(unittest.TestCase):
    def test_simple_pair(self):
        self.assertTrue(is_balanced("()"))

    def test_all_types(self):
        self.assertTrue(is_balanced("()[]{}"))

    def test_nested(self):
        self.assertTrue(is_balanced("([{}])"))

    # the bug: wrong-type nesting must be rejected
    def test_crossed(self):
        self.assertFalse(is_balanced("([)]"))

    def test_mismatch_pair(self):
        self.assertFalse(is_balanced("(]"))

    # hidden edge cases
    def test_unclosed(self):
        self.assertFalse(is_balanced("("))

    def test_unopened(self):
        self.assertFalse(is_balanced(")"))

    def test_empty_is_balanced(self):
        self.assertTrue(is_balanced(""))

    def test_ignores_other_chars(self):
        self.assertTrue(is_balanced("a(b)c[d]"))

    def test_extra_open(self):
        self.assertFalse(is_balanced("(()"))


if __name__ == "__main__":
    unittest.main()
