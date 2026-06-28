import unittest
from solution_stub import int_to_roman


class TestRoman(unittest.TestCase):
    def test_one(self):
        self.assertEqual(int_to_roman(1), "I")

    def test_three(self):
        self.assertEqual(int_to_roman(3), "III")

    # subtractive forms (the bug)
    def test_four(self):
        self.assertEqual(int_to_roman(4), "IV")

    def test_nine(self):
        self.assertEqual(int_to_roman(9), "IX")

    def test_forty(self):
        self.assertEqual(int_to_roman(40), "XL")

    def test_ninety(self):
        self.assertEqual(int_to_roman(90), "XC")

    def test_four_hundred(self):
        self.assertEqual(int_to_roman(400), "CD")

    def test_nine_hundred(self):
        self.assertEqual(int_to_roman(900), "CM")

    # hidden composite cases
    def test_2024(self):
        self.assertEqual(int_to_roman(2024), "MMXXIV")

    def test_max(self):
        self.assertEqual(int_to_roman(3999), "MMMCMXCIX")

    def test_58(self):
        self.assertEqual(int_to_roman(58), "LVIII")


if __name__ == "__main__":
    unittest.main()
