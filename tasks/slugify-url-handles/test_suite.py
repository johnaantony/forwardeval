# Ratified suite for the captured slugify session (reviewStatus: human_reviewed).
# The capture tool drafted the basics; the human who did the work added the
# separator-collapsing, trimming, and empty-input guarantees that the session
# was actually about.
import unittest

from solution_stub import slugify


class TestSlugify(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(slugify("Hello World"), "hello-world")

    def test_lowercases(self):
        self.assertEqual(slugify("MiXeD CaSe"), "mixed-case")

    def test_strips_punctuation(self):
        self.assertEqual(slugify("Hello, World!"), "hello-world")

    def test_underscores_are_separators(self):
        self.assertEqual(slugify("snake_case_title"), "snake-case-title")

    def test_collapses_separator_runs(self):
        self.assertEqual(slugify("a  -  b___c"), "a-b-c")

    def test_tabs_and_newlines(self):
        self.assertEqual(slugify("line one\nline\ttwo"), "line-one-line-two")

    def test_trims_leading_trailing(self):
        self.assertEqual(slugify("  --Hello--  "), "hello")

    def test_empty_returns_untitled(self):
        self.assertEqual(slugify(""), "untitled")

    def test_punctuation_only_returns_untitled(self):
        self.assertEqual(slugify("!!! ??? ..."), "untitled")

    def test_numbers_kept(self):
        self.assertEqual(slugify("Top 10 Tips (2026)"), "top-10-tips-2026")


if __name__ == "__main__":
    unittest.main()
