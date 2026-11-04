import json
import unittest
from pathlib import Path

from accent_benchmark import balanced_plan, summarize, validate
from prepare_vietmed import accent, identity
from prepare_vimd import audio_duration
from evaluate_accent import generation_cap_hit


def item(index=0, **changes):
    return {"id": str(index), "audio": f"{index}.wav", "audio_sha256": str(index),
            "speaker_id": f"person{index}", "source_recording_id": f"recording{index}",
            "source_id": "fixture", "source_revision": "fixed", "accent_source": "fixture annotation",
            "split": "validation", "accent": "north", "text": "xin chào", "duration_seconds": 5,
            **changes}


class AccentBenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.protocol = json.loads(Path(__file__).with_name("benchmark.protocol.json").read_text())

    def test_missing_group_is_not_zero_and_macro_is_unavailable(self):
        row = item()
        result = summarize([row], [{"id": row["id"], "reference": row["text"], "hypothesis": "xin chào"}], self.protocol)
        self.assertIsNone(result["groups"]["central"]["metrics"])
        self.assertIsNone(result["groups"]["fast"]["metrics"])
        self.assertIsNone(result["groups"]["heavy"]["metrics"])
        self.assertIsNone(result["macro_north_central_south_wer"])
        self.assertFalse(result["ready_for_final_acceptance"])

    def test_missing_prediction_fails_empty_prediction_is_counted(self):
        row = item()
        with self.assertRaises(ValueError):
            summarize([row], [], self.protocol)
        result = summarize([row], [{"id": row["id"], "reference": row["text"], "hypothesis": ""}], self.protocol)
        self.assertEqual(result["overall"]["metrics"]["wer_percent"], 100)

    def test_reference_mutation_and_duplicate_prediction_fail(self):
        prediction = {"id": "0", "reference": "wrong", "hypothesis": ""}
        with self.assertRaises(ValueError):
            summarize([item()], [prediction], self.protocol)
        prediction["reference"] = "xin chào"
        with self.assertRaises(ValueError):
            summarize([item()], [prediction, prediction], self.protocol)

    def test_speaker_recording_and_encoded_audio_overlap_fail(self):
        row = item(encoded_audio_sha256="abc")
        for identity_row in ({"speaker_id": row["speaker_id"]},
                             {"speaker_id": "other", "source_recording_id": row["source_recording_id"]},
                             {"speaker_id": "other", "encoded_audio_sha256": "abc"}):
            with self.assertRaises(ValueError):
                validate([row], [identity_row])
        with self.assertRaises(ValueError):
            validate([row, item(1, split="train", speaker_id=row["speaker_id"])])

    def test_duplicate_audio_and_unproven_cohort_fail(self):
        with self.assertRaises(ValueError):
            validate([item(), item(1, audio_sha256="0")])
        with self.assertRaises(ValueError):
            validate([item(speed="fast")])
        with self.assertRaises(ValueError):
            validate([item(accent_strength="heavy")])

    def test_highland_is_not_central_and_unknown_stays_unknown(self):
        self.assertEqual(accent("Central Highland"), "central_highlands")
        self.assertEqual(accent("South West"), "south")
        self.assertEqual(accent("new label"), "unknown")
        self.assertNotEqual(identity("speaker", "a"), identity("recording", "a"))

    def test_test_split_not_scored_by_development_command(self):
        with self.assertRaises(ValueError):
            summarize([item(split="test")], [], self.protocol)

    def test_vimd_duration_comes_from_audio_header_without_length_column(self):
        import io
        import wave
        payload = io.BytesIO()
        with wave.open(payload, "wb") as stream:
            stream.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
            stream.writeframes(b"\x00\x00" * 8000)
        self.assertEqual(audio_duration(payload.getvalue()), 1)

    def test_generation_cap_with_three_token_prompt_and_eos_at_boundary(self):
        self.assertTrue(generation_cap_hit([1] * 228, eos_token_id=2, max_new_tokens=225))
        self.assertFalse(generation_cap_hit([1] * 227 + [2], eos_token_id=2, max_new_tokens=225))
        self.assertFalse(generation_cap_hit([1] * 8 + [2], eos_token_id=2, max_new_tokens=225))

    def test_bootstrap_deterministic_and_unavailable_for_one_speaker(self):
        rows = [item(i) for i in range(5)]
        predictions = [{"id": r["id"], "reference": r["text"], "hypothesis": "xin chào" if i else "xin"}
                       for i, r in enumerate(rows)]
        first = summarize(rows, predictions, self.protocol)
        second = summarize(rows, predictions, self.protocol)
        self.assertEqual(first["overall"]["wer_ci_95"], second["overall"]["wer_ci_95"])
        self.assertLessEqual(first["overall"]["wer_ci_95"]["wer_percent_low"], 10)
        self.assertGreaterEqual(first["overall"]["wer_ci_95"]["wer_percent_high"], 10)
        self.assertIsNone(summarize(rows[:1], predictions[:1], self.protocol)["overall"]["wer_ci_95"])

    def test_balancing_blocks_missing_region_and_respects_unique_budget(self):
        self.assertEqual(balanced_plan([item(split="train")])["missing"], ["central", "south"])
        rows = [item(i * 10 + j, split="train", accent=a, speaker_id=f"{a}-{j // 3}")
                for i, a in enumerate(("north", "central", "south")) for j in range(6)]
        plan = balanced_plan(rows, seconds_per_region=20, seconds_per_speaker=5)
        by_id = {r["id"]: r for r in rows}
        self.assertEqual(len(plan["selected_ids"]), len(set(plan["selected_ids"])))
        for speaker in {r["speaker_id"] for r in rows}:
            self.assertLessEqual(sum(by_id[i]["duration_seconds"] for i in plan["selected_ids"]
                                     if by_id[i]["speaker_id"] == speaker), 5)
        self.assertTrue(all(value <= 20 for value in plan["unique_seconds_by_region"].values()))
        self.assertFalse(plan["ready_for_auto_train"])


if __name__ == "__main__":
    unittest.main()
