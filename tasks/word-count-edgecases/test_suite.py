import unittest
from solution_stub import word_count


class TestWordCount(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(word_count("the cat sat"), {"the": 1, "cat": 1, "sat": 1})

    def test_case_insensitive(self):
        self.assertEqual(word_count("The the THE"), {"the": 3})

    def test_strips_punctuation(self):
        self.assertEqual(word_count("cat, cat. cat!"), {"cat": 3})

    # hidden edge cases
    def test_internal_apostrophe_kept(self):
        self.assertEqual(word_count("don't DON'T Don't"), {"don't": 3})

    def test_mixed(self):
        self.assertEqual(
            word_count("Hello, world! Hello."), {"hello": 2, "world": 1}
        )

    def test_empty(self):
        self.assertEqual(word_count(""), {})

    def test_extra_whitespace(self):
        self.assertEqual(word_count("  a   b  a "), {"a": 2, "b": 1})

    def test_quoted_token(self):
        self.assertEqual(word_count('"quote" quote'), {"quote": 2})


if __name__ == "__main__":
    unittest.main()
