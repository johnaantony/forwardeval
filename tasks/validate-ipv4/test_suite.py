import unittest
from solution_stub import is_valid_ipv4


class TestIPv4(unittest.TestCase):
    def test_zeros(self):
        self.assertTrue(is_valid_ipv4("0.0.0.0"))

    def test_broadcast(self):
        self.assertTrue(is_valid_ipv4("255.255.255.255"))

    def test_typical(self):
        self.assertTrue(is_valid_ipv4("192.168.1.1"))

    def test_octet_too_large(self):
        self.assertFalse(is_valid_ipv4("256.1.1.1"))

    def test_too_few_octets(self):
        self.assertFalse(is_valid_ipv4("1.2.3"))

    def test_too_many_octets(self):
        self.assertFalse(is_valid_ipv4("1.2.3.4.5"))

    # the bug: leading zeros must be rejected
    def test_leading_zero(self):
        self.assertFalse(is_valid_ipv4("01.2.3.4"))

    def test_leading_zero_last_octet(self):
        self.assertFalse(is_valid_ipv4("1.2.3.04"))

    # hidden edge cases
    def test_empty_octet(self):
        self.assertFalse(is_valid_ipv4("1.2.3."))

    def test_non_numeric(self):
        self.assertFalse(is_valid_ipv4("a.b.c.d"))

    def test_empty_string(self):
        self.assertFalse(is_valid_ipv4(""))


if __name__ == "__main__":
    unittest.main()
