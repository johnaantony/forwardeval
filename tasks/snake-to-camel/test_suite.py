import unittest
from solution_stub import to_camel


class TestToCamel(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(to_camel("user_id"), "userId")

    def test_two_words(self):
        self.assertEqual(to_camel("first_name"), "firstName")

    def test_three_words(self):
        self.assertEqual(to_camel("a_b_c"), "aBC")

    # hidden edge cases
    def test_leading_underscore(self):
        self.assertEqual(to_camel("_leading"), "leading")

    def test_trailing_underscore(self):
        self.assertEqual(to_camel("trailing_"), "trailing")

    def test_double_underscore(self):
        self.assertEqual(to_camel("user__id"), "userId")

    def test_preserves_rest_casing(self):
        self.assertEqual(to_camel("user_ID"), "userID")

    def test_empty(self):
        self.assertEqual(to_camel(""), "")

    def test_single_word(self):
        self.assertEqual(to_camel("single"), "single")


if __name__ == "__main__":
    unittest.main()
