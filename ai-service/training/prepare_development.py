"""Expand VIVOS train diversity; pin validation and reserve unopened test speakers.

Does not read original-test prompts or extract original-test audio.
"""
import argparse
import hashlib
import json
import tarfile
import wave
from collections import Counter
from pathlib import Path

from evidence import audit, sha256, write_json
from prepare_vivos import MD5, DOI, checksum_md5


def prepare(archive, pilot, output, cap=50, seed=42):
    if output.exists():
        raise ValueError("Output already exists")
    if checksum_md5(archive) != MD5:
        raise ValueError("Official archive checksum mismatch")
    pilot_rows = [json.loads(line) for line in (pilot / "manifest.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    validation = [r for r in pilot_rows if r["split"] == "validation"]
    excluded_speakers = {r["speaker_id"].split(":", 1)[1] for r in validation}
    seen_test_speakers = {r["speaker_id"].split(":", 1)[1] for r in pilot_rows if r["split"] == "test"}
    prompts, candidates, test_index = {}, {}, {}
    with tarfile.open(archive, "r:gz") as bundle:
        members = bundle.getmembers()
        prompt_files = [m for m in members if m.isfile() and m.name.endswith("/train/prompts.txt")]
        if len(prompt_files) != 1 or prompt_files[0].size > 10 * 1024 * 1024:
            raise ValueError("Invalid train metadata")
        with bundle.extractfile(prompt_files[0]) as stream:
            for line in stream.read().decode("utf-8-sig").splitlines():
                identifier, text = line.split(maxsplit=1)
                if identifier in prompts:
                    raise ValueError("Duplicate prompt ID")
                prompts[identifier] = text
        for member in members:
            if not member.isfile() or not member.name.endswith(".wav"):
                continue
            identifier = Path(member.name).stem
            speaker = identifier.split("_")[0]
            if "/test/" in member.name:
                if speaker not in seen_test_speakers:
                    test_index[identifier] = speaker  # identifiers only, no labels/audio
            elif "/train/" in member.name and speaker not in excluded_speakers and identifier in prompts:
                if identifier.replace("_", "").isalnum() and member.size <= 1024 * 1024:
                    candidates.setdefault(speaker, []).append(identifier)
    def rank(identifier):
        return hashlib.sha256(f"{seed}:{identifier}".encode()).hexdigest()
    selected = {identifier for group in candidates.values() for identifier in sorted(group, key=rank)[:cap]}
    if set(candidates) & set(test_index.values()):
        raise ValueError("Train and reserved test speaker overlap")
    output.mkdir(parents=True)
    (output / "audio").mkdir()
    rows, rejected, seen_pcm = [], [], set()
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle:
            identifier = Path(member.name).stem
            if not member.isfile() or not member.name.endswith(".wav") or identifier not in selected:
                continue
            with bundle.extractfile(member) as stream:
                try:
                    with wave.open(stream, "rb") as audio:
                        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
                            rejected.append({"id": identifier, "reason": "format"}); continue
                        frames = audio.getnframes()
                        if not 0 < frames <= 30 * 16000:
                            rejected.append({"id": identifier, "reason": "duration"}); continue
                        pcm = audio.readframes(frames)
                        if len(pcm) != frames * 2 or not any(pcm):
                            rejected.append({"id": identifier, "reason": "truncated_or_zero_audio"}); continue
                except wave.Error:
                    rejected.append({"id": identifier, "reason": "wav_decode"}); continue
            digest = hashlib.sha256(pcm).hexdigest()
            if digest in seen_pcm:
                rejected.append({"id": identifier, "reason": "duplicate_pcm"}); continue
            seen_pcm.add(digest)
            target = output / "audio" / f"{identifier}.wav"
            with wave.open(str(target), "wb") as audio:
                audio.setparams((1, 2, 16000, 0, "NONE", "not compressed")); audio.writeframes(pcm)
            speaker = identifier.split("_")[0]
            rows.append(dict(id=identifier, audio=f"audio/{identifier}.wav", text=prompts[identifier],
                speaker_id=f"vivos:{speaker}", split="train", language="vi", source=DOI,
                permission="CC BY-NC-SA 4.0; academic use only"))
    for row in validation:
        # Preserve exact original validation bytes and labels; reference local immutable pilot audio.
        rows.append({**row, "audio": str((pilot / row["audio"]).resolve())})
    manifest = output / "manifest.jsonl"
    manifest.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
    records, summary = audit(manifest, development=True)
    write_json(output / "provenance.json", {"source": DOI, "archive_sha256": sha256(archive),
        "pilot_manifest_sha256": sha256(pilot / "manifest.jsonl"), "seed": seed,
        "selection": "Lowest SHA256(seed:id) ranks per original-train speaker, excluding pinned validation speakers",
        "per_speaker_cap": cap, "rejected": rejected, "summary": summary,
        "original_references_preserved": True, "validation_pinned": True,
        "holdout_unopened_speakers": len(set(test_index.values())),
        "old_test_speakers_excluded_from_reservation": sorted(seen_test_speakers),
        "test_access": "Archive member IDs only. No test prompt file or test audio opened; no test rows in development manifest",
        "license": "CC BY-NC-SA4.0 academic only", "source_sha256": sha256(Path(__file__))})
    write_json(output / "holdout-reservation.private.json", {"status": "reserved_not_materialized",
        "utterance_to_speaker": test_index, "note": "Do not open/evaluate before final protocol/model selection is frozen"})
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--pilot", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--cap", type=int, default=50)
    args = parser.parse_args()
    if not 1 <= args.cap <= 200:
        raise ValueError("cap must be in [1,200]")
    print(json.dumps(prepare(args.archive.resolve(), args.pilot.resolve(), args.output.resolve(), args.cap)))
