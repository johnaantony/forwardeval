import unittest
from solution_stub import fizzbuzz


class TestFizzBuzz(unittest.TestCase):
    def test_basic_sequence(self):
        self.assertEqual(fizzbuzz(5), ["1", "2", "Fizz", "4", "Buzz"])

    def test_fizz(self):
        self.assertEqual(fizzbuzz(3)[2], "Fizz")

    def test_buzz(self):
        self.assertEqual(fizzbuzz(5)[4], "Buzz")

    def test_fizzbuzz_at_15(self):
        self.assertEqual(fizzbuzz(15)[14], "FizzBuzz")

    # hidden edge cases (not spelled out in the prompt)
    def test_all_strings(self):
        self.assertTrue(all(isinstance(x, str) for x in fizzbuzz(20)))

    def test_zero_returns_empty(self):
        self.assertEqual(fizzbuzz(0), [])

    def test_one(self):
        self.assertEqual(fizzbuzz(1), ["1"])

    def test_length(self):
        self.assertEqual(len(fizzbuzz(30)), 30)


if __name__ == "__main__":
    unittest.main()
