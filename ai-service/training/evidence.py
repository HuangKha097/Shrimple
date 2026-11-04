"""Local-only data audit and reproducible ASR metrics; no ML dependencies."""
import hashlib
import json
import math
import unicodedata
import wave
from collections import Counter
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2,
                                   allow_nan=False) + "\n", encoding="utf-8")


def normalize(text):
    text = unicodedata.normalize("NFC", text).casefold()
    return " ".join("".join(" " if unicodedata.category(c).startswith("P") else c
                            for c in text).split())


def distance(reference, hypothesis):
    previous = list(range(len(hypothesis) + 1))
    for i, left in enumerate(reference, 1):
        current = [i]
        for j, right in enumerate(hypothesis, 1):
            current.append(min(current[-1] + 1, previous[j] + 1,
                               previous[j - 1] + (left != right)))
        previous = current
    return previous[-1]


def score(pairs):
    """Corpus error rates, not a mean of utterance rates. Can exceed 100%."""
    words = chars = word_errors = char_errors = 0
    for reference, hypothesis in pairs:
        ref, hyp = normalize(reference), normalize(hypothesis)
        if not ref:
            raise ValueError("Reference is empty after normalization")
        rw, hw = ref.split(), hyp.split()
        rc, hc = ref.replace(" ", ""), hyp.replace(" ", "")
        words += len(rw)
        chars += len(rc)
        word_errors += distance(rw, hw)
        char_errors += distance(rc, hc)
    if not words:
        raise ValueError("Evaluation set is empty")
    return {"wer_percent": 100 * word_errors / words,
            "cer_percent": 100 * char_errors / chars,
            "word_errors": word_errors, "reference_words": words,
            "char_errors": char_errors, "reference_chars": chars}


def audit(manifest, *, development=False):
    """Fail closed on leakage, missing provenance, or incompatible audio."""
    manifest = Path(manifest).resolve()
    records, ids, speakers, audio_splits = [], set(), {}, {}
    pcm_splits = {}
    for line_no, line in enumerate(manifest.read_text(encoding="utf-8-sig").splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        required = ("id", "audio", "text", "speaker_id", "split", "language",
                    "source", "permission")
        if not isinstance(row, dict) or any(not isinstance(row.get(k), str)
                                            or not row[k].strip() for k in required):
            raise ValueError(f"Row {line_no}: missing/non-string required field")
        if row["id"] in ids:
            raise ValueError(f"Row {line_no}: duplicate id")
        ids.add(row["id"])
        split = row["split"]
        if development and split == "test":
            raise ValueError("Development manifest must not contain test rows")
        if split not in ("train", "validation", "test") or row["language"] not in ("vi", "en", "zh"):
            raise ValueError(f"Row {line_no}: unsupported split/language")
        if not normalize(row["text"]):
            raise ValueError(f"Row {line_no}: empty normalized reference")
        speaker = row["speaker_id"]
        if speaker in speakers and speakers[speaker] != split:
            raise ValueError(f"Row {line_no}: speaker leakage across splits")
        speakers[speaker] = split
        audio = (manifest.parent / row["audio"]).resolve()
        with wave.open(str(audio), "rb") as wav:
            duration = wav.getnframes() / wav.getframerate()
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (1, 2, 16000, "NONE"):
                raise ValueError(f"Row {line_no}: require mono PCM16 WAV 16000Hz")
            pcm = wav.readframes(wav.getnframes())
            if not math.isfinite(duration) or not 0 < duration <= 30:
                raise ValueError(f"Row {line_no}: audio must be in (0, 30] seconds")
            if len(pcm) != wav.getnframes() * 2:
                raise ValueError(f"Row {line_no}: truncated audio")
        digest, pcm_digest = sha256(audio), hashlib.sha256(pcm).hexdigest()
        for seen, key in ((audio_splits, digest), (pcm_splits, pcm_digest)):
            if key in seen:
                raise ValueError(f"Row {line_no}: duplicate audio (possibly split leakage)")
            seen[key] = split
        records.append({**row, "audio": str(audio), "audio_sha256": digest,
                        "pcm_sha256": pcm_digest, "duration_seconds": duration})
    counts = Counter(r["split"] for r in records)
    required = ("train", "validation") if development else ("train", "validation", "test")
    if any(not counts[s] for s in required):
        raise ValueError("Require non-empty train and validation splits" if development else
                         "Require non-empty train, validation and held-out test splits")
    summary = {"manifest_sha256": sha256(manifest), "counts": dict(counts),
               "evaluation_scope": "development" if development else "final",
               "languages": dict(Counter(r["language"] for r in records)),
               "seconds_by_split": {s: sum(r["duration_seconds"] for r in records if r["split"] == s)
                                    for s in counts},
               "speakers_by_split": dict(Counter(speakers.values())),
               "normalization": "NFC, casefold, punctuation-to-space, collapse whitespace; CER excludes spaces",
               "permission_note": "Declared by dataset owner; audit does not verify legal rights",
               "leakage_note": "Rejects repeated speaker IDs and exact audio/PCM duplicates; cannot detect renamed speakers or near-duplicate audio"}
    return records, summary
