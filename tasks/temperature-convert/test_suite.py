import unittest
from solution_stub import convert


class TestConvert(unittest.TestCase):
    def test_c_to_f(self):
        self.assertEqual(convert(100, "C", "F"), 212.0)

    def test_f_to_c(self):
        self.assertEqual(convert(32, "F", "C"), 0.0)

    # hidden: Kelvin conversions
    def test_c_to_k(self):
        self.assertEqual(convert(0, "C", "K"), 273.15)

    def test_k_to_c(self):
        self.assertEqual(convert(273.15, "K", "C"), 0.0)

    def test_f_to_k(self):
        self.assertEqual(convert(32, "F", "K"), 273.15)

    def test_k_to_f(self):
        self.assertEqual(convert(273.15, "K", "F"), 32.0)

    # hidden: same-unit identity + rounding
    def test_same_unit(self):
        self.assertEqual(convert(21.5, "C", "C"), 21.5)

    def test_rounding(self):
        self.assertEqual(convert(98.6, "F", "C"), 37.0)


if __name__ == "__main__":
    unittest.main()
