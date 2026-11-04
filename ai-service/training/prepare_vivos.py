"""Prepare a seeded speaker-disjoint VIVOS pilot from the official archive.

No dataset loading scripts are executed. Academic/non-commercial research only.
"""
import argparse
import hashlib
import json
import random
import shutil
import tarfile
import urllib.request
import wave
from collections import defaultdict
from pathlib import Path

from evidence import audit, sha256, write_json

URL = "https://zenodo.org/records/7068130/files/vivos.tar.gz?download=1"
MIRROR = "https://huggingface.co/datasets/AILAB-VNUHCM/vivos/resolve/main/data/vivos.tar.gz"
DOI = "https://doi.org/10.5281/zenodo.7068130"
MD5 = "72972a8b14050f3f11ea7c3debabd7af"


def checksum_md5(path):
    digest = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare(archive, output, per_speaker=20, seed=42):
    if output.exists():
        raise ValueError("Output exists; refusing overwrite")
    if checksum_md5(archive) != MD5:
        raise ValueError("Archive differs from official Zenodo MD5")
    prompts = {}
    # Inspect metadata only; do not extract paths, symlinks or executable files.
    with tarfile.open(archive, "r:gz") as bundle:
        for split in ("train", "test"):
            members = [m for m in bundle.getmembers() if m.isfile() and m.name.endswith(f"/{split}/prompts.txt")]
            if len(members) != 1 or members[0].size > 10 * 1024 * 1024:
                raise ValueError("Unexpected prompt metadata")
            with bundle.extractfile(members[0]) as stream:
                lines = stream.read().decode("utf-8-sig").splitlines()
            for line in lines:
                identifier, text = line.split(maxsplit=1)
                if identifier in prompts:
                    raise ValueError("Duplicate utterance ID")
                prompts[identifier] = (split, text)
    pools = {split: sorted({identifier.split("_")[0] for identifier, (s, _) in prompts.items() if s == split})
             for split in ("train", "test")}
    if set(pools["train"]) & set(pools["test"]):
        raise ValueError("Official speaker IDs overlap; investigate before proceeding")
    rng = random.Random(seed)
    rng.shuffle(pools["train"])
    rng.shuffle(pools["test"])
    if len(pools["train"]) < 11 or len(pools["test"]) < 3:
        raise ValueError("Insufficient distinct speakers")
    mapping = {speaker: split for split, group in
               (("train", pools["train"][:8]), ("validation", pools["train"][8:11]), ("test", pools["test"][:3]))
               for speaker in group}
    output.mkdir(parents=True)
    (output / "audio").mkdir()
    rows, counts = [], defaultdict(int)
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle:
            if not member.isfile() or not member.name.endswith(".wav"):
                continue
            identifier = Path(member.name).stem
            speaker = identifier.split("_")[0]
            if speaker not in mapping or identifier not in prompts or counts[speaker] >= per_speaker:
                continue
            if not identifier.replace("_", "").isalnum() or member.size > 1024 * 1024:
                continue
            with bundle.extractfile(member) as source:
                try:
                    with wave.open(source, "rb") as audio:
                        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
                            continue
                        duration = audio.getnframes() / 16000
                        if not 0 < duration <= 30:
                            continue
                        pcm = audio.readframes(audio.getnframes())
                except wave.Error:
                    continue
            target = output / "audio" / f"{identifier}.wav"
            with wave.open(str(target), "wb") as audio:
                audio.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
                audio.writeframes(pcm)
            rows.append(dict(id=identifier, audio=f"audio/{identifier}.wav", text=prompts[identifier][1],
                             speaker_id=f"vivos:{speaker}", split=mapping[speaker], language="vi",
                             source=DOI, permission="CC BY-NC-SA 4.0; official corpus academic use only"))
            counts[speaker] += 1
    if set(counts) != set(mapping):
        raise ValueError("Some selected speakers have no usable audio")
    manifest = output / "manifest.jsonl"
    manifest.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
    _, summary = audit(manifest)
    write_json(output / "provenance.json", {"source": DOI, "download_url": URL,
        "archive_md5": MD5, "archive_sha256": sha256(archive), "seed": seed,
        "selection": "8 original-train speakers for training, 3 original-train for validation, 3 original-test for test; first eligible clips per speaker in archive order",
        "per_speaker_cap": per_speaker, "speaker_assignment": mapping,
        "summary": summary, "limitations": "Small pilot of read speech; not a general conversation benchmark. Whisper pretraining overlap is unknown. Preserve official attribution and NC/SA/academic restrictions; not approved for commercial deployment."})
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--mirror", action="store_true", help="Use the author's HF mirror; same mandatory official MD5")
    parser.add_argument("--per-speaker", type=int, default=20)
    args = parser.parse_args()
    if not 1 <= args.per_speaker <= 200:
        raise ValueError("per-speaker must be in [1, 200]")
    args.archive.parent.mkdir(parents=True, exist_ok=True)
    if args.download and not args.archive.exists():
        if shutil.disk_usage(args.archive.parent).free < 8 * 1024 ** 3:
            raise ValueError("Require at least 8GiB free workspace disk")
        partial = args.archive.with_suffix(".mirror.part" if args.mirror else ".part")
        download_url = MIRROR if args.mirror else URL
        with urllib.request.urlopen(download_url, timeout=60) as source, partial.open("xb") as target:
            downloaded = 0
            while chunk := source.read(1024 * 1024):
                target.write(chunk)
                downloaded += len(chunk)
                if downloaded % (100 * 1024 * 1024) == 0:
                    print(f"Downloaded {downloaded // 1024 // 1024} MiB", flush=True)
        if checksum_md5(partial) != MD5:
            raise ValueError("Download checksum mismatch; partial retained for inspection")
        partial.rename(args.archive)
    print(json.dumps(prepare(args.archive, args.output, args.per_speaker)), flush=True)
