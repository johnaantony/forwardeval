# Ratified suite for the captured retry session (reviewStatus: human_reviewed).
# Time is injected, so the backoff schedule is asserted exactly and the suite
# runs in milliseconds - determinism is the whole point.
import unittest

from solution_stub import retry


class Flaky:
    """Callable that fails `failures` times, then returns `value`."""

    def __init__(self, failures, value="ok"):
        self.failures = failures
        self.value = value
        self.calls = 0

    def __call__(self):
        self.calls += 1
        if self.calls <= self.failures:
            raise ValueError(f"boom {self.calls}")
        return self.value


class TestRetry(unittest.TestCase):
    def setUp(self):
        self.delays = []
        self.sleep = self.delays.append

    def test_success_first_try_no_sleep(self):
        fn = Flaky(0, value=42)
        self.assertEqual(retry(fn, attempts=3, sleep=self.sleep), 42)
        self.assertEqual(fn.calls, 1)
        self.assertEqual(self.delays, [])

    def test_backoff_schedule_doubles(self):
        fn = Flaky(2)
        self.assertEqual(retry(fn, attempts=3, base_delay=1.0, sleep=self.sleep), "ok")
        self.assertEqual(fn.calls, 3)
        self.assertEqual(self.delays, [1.0, 2.0])

    def test_custom_base_delay(self):
        fn = Flaky(2)
        retry(fn, attempts=3, base_delay=0.5, sleep=self.sleep)
        self.assertEqual(self.delays, [0.5, 1.0])

    def test_reraises_last_exception(self):
        fn = Flaky(99)
        with self.assertRaises(ValueError) as ctx:
            retry(fn, attempts=3, sleep=self.sleep)
        self.assertEqual(str(ctx.exception), "boom 3")
        self.assertEqual(fn.calls, 3)

    def test_no_sleep_after_final_failure(self):
        fn = Flaky(99)
        with self.assertRaises(ValueError):
            retry(fn, attempts=3, base_delay=1.0, sleep=self.sleep)
        # waits happen between attempts only: 2 waits for 3 attempts
        self.assertEqual(self.delays, [1.0, 2.0])

    def test_single_attempt_raises_immediately(self):
        fn = Flaky(99)
        with self.assertRaises(ValueError):
            retry(fn, attempts=1, sleep=self.sleep)
        self.assertEqual(fn.calls, 1)
        self.assertEqual(self.delays, [])

    def test_result_passthrough(self):
        self.assertEqual(retry(lambda: {"a": 1}, sleep=self.sleep), {"a": 1})


if __name__ == "__main__":
    unittest.main()
