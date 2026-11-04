"""Package report artifacts and methods; raw audio, transcripts and weights stay private."""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

from evidence import sha256

REPO = Path(__file__).resolve().parent.parent.parent


def package(report, assets, output):
    if output.exists():
        raise ValueError("Evidence bundle already exists")
    if json.loads((assets / "results.json").read_text(encoding="utf-8"))["suite_status"] != "completed":
        raise ValueError("Cannot package incomplete research results")
    files = {str(report.relative_to(REPO)).replace("\\", "/"): report}
    pending, visited = [report], set()
    allowed = {".md", ".json", ".csv", ".png", ".txt"}
    while pending:
        current = pending.pop()
        if current in visited:
            continue
        visited.add(current)
        for target in re.findall(r"\]\(([^)]+)\)", current.read_text(encoding="utf-8")):
            target = target.strip("<>")
            if "://" in target or target.startswith("#"):
                continue
            linked = (current.parent / target.split("#")[0]).resolve()
            if linked.is_relative_to(REPO / "docs") and linked.suffix in allowed and linked.is_file():
                files[str(linked.relative_to(REPO)).replace("\\", "/")] = linked
                if linked.suffix == ".md":
                    pending.append(linked)
    for path in assets.iterdir():
        if path.is_file() and path.suffix in (".json", ".csv", ".png", ".txt") and ".private." not in path.name:
            files[str(path.relative_to(REPO)).replace("\\", "/")] = path
    root = REPO / "ai-service" / "training"
    for path in [*root.glob("*.py"), *root.glob("config*.json"), root / "requirements.txt"]:
        files[str(path.relative_to(REPO)).replace("\\", "/")] = path
    # Include the frozen input plan and data protocol receipts, not raw samples/labels.
    for path in [REPO / "docs/validation/assets/2026-11-02-whisper-analysis/experiment-plan.json",
                 REPO / "docs/validation/assets/2026-11-02-whisper-analysis/development-data.json"]:
        files[str(path.relative_to(REPO)).replace("\\", "/")] = path
    manifest = {name: sha256(path) for name, path in files.items()}
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, path in files.items():
            archive.write(path, name)
        archive.writestr("SHA256-MANIFEST.json", json.dumps(manifest, indent=2) + "\n")
        archive.writestr("README.txt", "Whisper development report evidence. Open docs/validation/2026-11-03-whisper-development.md.\n"
            "Includes all four results, methods, frozen configs, logs and tables. Raw recordings/transcripts/checkpoint weights remain in private local runs.\n"
            "Validation-only evidence; final test and serving acceptance are not included. VIVOS use is academic, CC BY-NC-SA4.0; see report attribution.\n")
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise ValueError("Evidence bundle CRC failed")
        for name, expected in manifest.items():
            if hashlib.sha256(archive.read(name)).hexdigest() != expected:
                raise ValueError("Evidence bundle content hash failed")
    output.with_suffix(".zip.sha256").write_text(sha256(output) + "  " + output.name + "\n", encoding="utf-8")
    return len(files)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--assets", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    print(f"Packaged and verified {package(args.report.resolve(), args.assets.resolve(), args.output.resolve())} report/method files")
