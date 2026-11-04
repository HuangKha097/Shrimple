"""Regression tests for leakage prevention, metrics and failed-run evidence."""
import json
import csv
import hashlib
import io
import math
import struct
import subprocess
import sys
import tempfile
import tarfile
import unittest
from unittest.mock import patch
import wave
from pathlib import Path

from evidence import audit, normalize, score
from finetune import validate_config, training_text, OPTIONAL_CONFIG
from analyze_asr import edits, aggregate
from prepare_audio import manifest_from_csv
from prepare_vivos import prepare as prepare_vivos
from prepare_development import prepare as prepare_development


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        scratch = Path(__file__).resolve().parent / "runs"
        scratch.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=scratch)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.rows = []
        for i, split in enumerate(("train", "validation", "test")):
            audio = self.root / f"{i}.wav"
            with wave.open(str(audio), "wb") as stream:
                stream.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
                stream.writeframes(b"".join(struct.pack("<h", int(1000 * math.sin(j * (i + 1) / 10))) for j in range(1600)))
            self.rows.append(dict(id=str(i), audio=audio.name, text="Xin chào", speaker_id=f"speaker-{i}",
                                  split=split, language="vi", source="synthetic fixture",
                                  permission="generated locally, not research data"))

    def manifest(self):
        target = self.root / "manifest.jsonl"
        target.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in self.rows), encoding="utf-8")
        return target

    def test_valid_manifest(self):
        records, summary = audit(self.manifest())
        self.assertEqual(summary["counts"], {"train": 1, "validation": 1, "test": 1})
        self.assertEqual(len(records[0]["audio_sha256"]), 64)

    def test_speaker_leakage(self):
        self.rows[2]["speaker_id"] = self.rows[0]["speaker_id"]
        with self.assertRaisesRegex(ValueError, "speaker leakage"):
            audit(self.manifest())

    def test_renamed_duplicate_audio(self):
        (self.root / "2.wav").write_bytes((self.root / "0.wav").read_bytes())
        with self.assertRaisesRegex(ValueError, "duplicate audio"):
            audit(self.manifest())

    def test_pcm_duplicate_with_different_container(self):
        original = (self.root / "0.wav").read_bytes()
        # Same audio samples, different RIFF container bytes.
        (self.root / "2.wav").write_bytes(original + b"metadata")
        with self.assertRaisesRegex(ValueError, "duplicate audio"):
            audit(self.manifest())

    def test_missing_permission(self):
        del self.rows[0]["permission"]
        with self.assertRaisesRegex(ValueError, "required field"):
            audit(self.manifest())

    def test_unreviewed_draft_cannot_become_manifest(self):
        source = self.root / "draft.csv"
        row = {**self.rows[0], "review_status": "unreviewed"}
        with source.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(row))
            writer.writeheader()
            writer.writerow(row)
        with self.assertRaisesRegex(ValueError, "reviewed"):
            manifest_from_csv(source, self.root / "manifest.jsonl")

    def test_manifest_conversion_refuses_overwrite(self):
        source = self.root / "annotations.csv"
        with source.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(self.rows[0]))
            writer.writeheader()
            writer.writerows(self.rows)
        output = self.root / "manifest.jsonl"
        manifest_from_csv(source, output)
        with self.assertRaises(FileExistsError):
            manifest_from_csv(source, output)

    def test_missing_held_out_split(self):
        self.rows.pop()
        with self.assertRaisesRegex(ValueError, "held-out"):
            audit(self.manifest())

    def test_development_rejects_test_before_model_access(self):
        with self.assertRaisesRegex(ValueError, "must not contain test"):
            audit(self.manifest(), development=True)

    def test_development_accepts_train_validation_only(self):
        self.rows = self.rows[:2]
        _, summary = audit(self.manifest(), development=True)
        self.assertEqual(summary["evaluation_scope"], "development")
        self.assertNotIn("test", summary["counts"])

    def test_label_transform_preserves_reference_and_accents(self):
        original = "TÔI ĐẾN HÀ NỘI"
        self.assertEqual(training_text(original, {"label_case": "lower"}), "tôi đến hà nội")
        self.assertEqual(training_text(original, {}), original)
        self.assertEqual(original, "TÔI ĐẾN HÀ NỘI")

    def test_alignment_counts_insertions_deletions_and_marks(self):
        self.assertEqual(edits("a b", "a"), [("deletion", "b", "")])
        self.assertEqual(edits("a", "a b"), [("insertion", "", "b")])
        result = aggregate([{"reference": "bạn đi", "hypothesis": "bàn đi"}])
        self.assertEqual(result["operations"], {"substitution": 1})
        self.assertEqual(result["substitutions_differing_only_in_diacritics"], 1)

    def test_wrong_sample_rate(self):
        with wave.open(str(self.root / "0.wav"), "wb") as stream:
            stream.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
            stream.writeframes(b"\x01\x00" * 80)
        with self.assertRaisesRegex(ValueError, "16000Hz"):
            audit(self.manifest())

    def test_unicode_and_punctuation(self):
        self.assertEqual(normalize("XIN CHA\u0300O, bạn!"), "xin chào bạn")
        self.assertEqual(score([("Xin chào!", "xin chào")])["wer_percent"], 0)

    def test_corpus_weighting_and_insertions(self):
        result = score([("a b c", "a b"), ("d", "x")])
        self.assertEqual(result["wer_percent"], 50)
        self.assertEqual(score([("a", "a b c")])["wer_percent"], 200)
        self.assertEqual(score([("a b", "")])["wer_percent"], 100)

    def test_empty_reference_rejected(self):
        with self.assertRaises(ValueError):
            score([("...", "a")])

    def test_config_rejects_wrong_model_or_nan(self):
        path = Path(__file__).with_name("config.base-lora.json")
        config = json.loads(path.read_text())
        validate_config(config)
        config["learning_rate"] = float("nan")
        with self.assertRaises(ValueError):
            validate_config(config)
        config["learning_rate"] = 0.0001
        config["model_id"] = "openai/whisper-base.en"
        with self.assertRaises(ValueError):
            validate_config(config)

    def test_development_config_validates_schedule_and_rejects_unknown_keys(self):
        config = {**json.loads(Path(__file__).with_name("config.base-lora.json").read_text()),
                  **OPTIONAL_CONFIG, "evaluation_scope": "development", "label_case": "lower",
                  "load_best_model_at_end": True, "warmup_steps": 10}
        validate_config(config)
        config["warmup_steps"] = config["max_steps"]
        with self.assertRaisesRegex(ValueError, "warmup_steps"):
            validate_config(config)
        config["warmup_steps"] = 10
        config["unexpected"] = 1
        with self.assertRaises(ValueError):
            validate_config(config)

    def test_vivos_rejects_corrupted_archive_before_output(self):
        archive = self.root / "bad.tar.gz"
        archive.write_bytes(b"not the official corpus")
        output = self.root / "corpus"
        with self.assertRaisesRegex(ValueError, "MD5"):
            prepare_vivos(archive, output)
        self.assertFalse(output.exists())

    def test_vivos_split_and_path_traversal_protection(self):
        archive = self.root / "fixture.tar.gz"
        with tarfile.open(archive, "w:gz") as bundle:
            for split, speakers in (("train", range(1, 12)), ("test", range(12, 15))):
                prompts = []
                for speaker in speakers:
                    identifier = f"SPK{speaker:02d}_R001"
                    prompts.append(f"{identifier} xin chào")
                    data = io.BytesIO()
                    with wave.open(data, "wb") as audio:
                        audio.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
                        audio.writeframes(struct.pack("<h", speaker) * 1600)
                    content = data.getvalue()
                    member = tarfile.TarInfo(f"vivos/{split}/waves/SPK{speaker:02d}/{identifier}.wav")
                    member.size = len(content)
                    bundle.addfile(member, io.BytesIO(content))
                content = "\n".join(prompts).encode("utf-8")
                member = tarfile.TarInfo(f"vivos/{split}/prompts.txt")
                member.size = len(content)
                bundle.addfile(member, io.BytesIO(content))
            member = tarfile.TarInfo("../../escape.wav")
            member.size = 4
            bundle.addfile(member, io.BytesIO(b"evil"))
        expected = hashlib.md5(archive.read_bytes(), usedforsecurity=False).hexdigest()
        with patch("prepare_vivos.MD5", expected):
            summary = prepare_vivos(archive, self.root / "corpus", per_speaker=1)
        self.assertEqual(summary["counts"], {"train": 8, "validation": 3, "test": 3})
        self.assertEqual(summary["speakers_by_split"], {"train": 8, "validation": 3, "test": 3})
        self.assertFalse((self.root / "escape.wav").exists())
        original_extract = tarfile.TarFile.extractfile

        def forbid_test_content(bundle, member, *args, **kwargs):
            name = member.name if hasattr(member, "name") else str(member)
            if "/test/" in name:
                raise AssertionError("Development preparation opened test contents")
            return original_extract(bundle, member, *args, **kwargs)

        with patch("prepare_development.MD5", expected), patch.object(tarfile.TarFile, "extractfile", forbid_test_content):
            dev = prepare_development(archive, self.root / "corpus", self.root / "development", cap=1)
        self.assertEqual(dev["evaluation_scope"], "development")
        self.assertEqual(dev["counts"], {"train": 8, "validation": 3})

    def test_failed_run_keeps_status_without_leaking_reference_to_console(self):
        self.rows[0]["permission"] = ""
        result = subprocess.run([sys.executable, str(Path(__file__).with_name("finetune.py")),
                                 "audit", "--manifest", str(self.manifest()), "--runs", str(self.root / "runs")],
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 1)
        run = next((self.root / "runs").iterdir())
        self.assertEqual(json.loads((run / "status.json").read_text())["status"], "failed")
        self.assertTrue((run / "artifacts-sha256.json").is_file())
        self.assertNotIn("Xin chào", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
