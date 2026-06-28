import unittest
from solution_stub import parse_csv


class TestParseCsv(unittest.TestCase):
    def test_plain(self):
        self.assertEqual(parse_csv("a,b,c"), ["a", "b", "c"])

    def test_quoted_comma(self):
        self.assertEqual(parse_csv('a,"b,c",d'), ["a", "b,c", "d"])

    def test_strips_quotes_even_without_comma(self):
        self.assertEqual(parse_csv('a,"b",c'), ["a", "b", "c"])

    # hidden edge cases
    def test_empty_field(self):
        self.assertEqual(parse_csv("a,,c"), ["a", "", "c"])

    def test_trailing_comma(self):
        self.assertEqual(parse_csv("a,b,"), ["a", "b", ""])

    def test_whole_field_quoted(self):
        self.assertEqual(parse_csv('"x,y"'), ["x,y"])

    def test_empty_line(self):
        self.assertEqual(parse_csv(""), [""])

    def test_quoted_empty(self):
        self.assertEqual(parse_csv('a,"",c'), ["a", "", "c"])


if __name__ == "__main__":
    unittest.main()
