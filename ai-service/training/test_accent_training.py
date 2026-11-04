import unittest

from prepare_accent_training import round_robin
from report_accent_round import paired_interval


class AccentTrainingTests(unittest.TestCase):
    def test_caps_without_replacement_are_reproducible(self):
        rows = [{"id": str(i), "speaker_id": str(i // 4), "duration_seconds": 3} for i in range(20)]
        result = round_robin(rows, 25, 6)
        self.assertEqual(result, round_robin(rows, 25, 6))
        self.assertLessEqual(sum(r["duration_seconds"] for r in result), 25)
        self.assertEqual(len(result), len({r["id"] for r in result}))
        for person in {r["speaker_id"] for r in rows}:
            self.assertLessEqual(sum(r["duration_seconds"] for r in result if r["speaker_id"] == person), 6)

    def test_invalid_or_duplicate_candidates_rejected(self):
        row = {"id": "1", "speaker_id": "a", "duration_seconds": 2}
        with self.assertRaises(ValueError):
            round_robin([row, row], 10, 10)
        with self.assertRaises(ValueError):
            round_robin([{**row, "duration_seconds": float("nan")}], 10, 10)
        with self.assertRaises(ValueError):
            round_robin([row], 0, 10)

    def test_paired_interval_zero_for_identical_outputs_and_keeps_pairing(self):
        rows = [{"id": str(i), "speaker_id": str(i), "text": "xin chào"} for i in range(5)]
        baseline = {r["id"]: {"hypothesis": "xin"} for r in rows}
        same = paired_interval(rows, baseline, baseline)
        self.assertEqual((same["delta_pp_low"], same["delta_pp_high"]), (0, 0))
        tuned = {r["id"]: {"hypothesis": "xin chào"} for r in rows}
        improved = paired_interval(rows, baseline, tuned)
        self.assertEqual((improved["delta_pp_low"], improved["delta_pp_high"]), (-50, -50))
        self.assertIsNone(paired_interval(rows[:1], baseline, tuned))


if __name__ == "__main__":
    unittest.main()
