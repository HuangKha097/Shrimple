"""Download pinned VinAI PhoWhisper-base and export GGML for whisper.cpp v1.9.4.

Run with the research venv (torch >=2.6, transformers), never inside FastAPI.
Model files stay in ignored runs/. No training data is uploaded.
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

from evidence import sha256, write_json
from trial_phowhisper import PHO_REVISION

SOURCES = {
    "convert-h5-to-ggml.py": (
        "https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.9.4/models/convert-h5-to-ggml.py",
        "9cc282dfcd9a24da03ffa1b4123b5508ee935e19e369c33520b1a73f89440094"),
    "mel_filters.npz": (
        "https://raw.githubusercontent.com/openai/whisper/v20250625/whisper/assets/mel_filters.npz",
        "7450ae70723a5ef9d341e3cee628c7cb0177f36ce42c44b7ed2bf3325f0f6d4c"),
}


def prepare(root):
    import requests
    from huggingface_hub import snapshot_download

    root.mkdir(parents=True, exist_ok=True)
    model = root / "model"
    snapshot_download("vinai/PhoWhisper-base", revision=PHO_REVISION, local_dir=model,
                      allow_patterns=["*.json", "*.txt", "pytorch_model.bin"], max_workers=2)
    converter = root / "converter"
    converter.mkdir(exist_ok=True)
    for name, (url, digest) in SOURCES.items():
        destination = converter / name
        if not destination.exists() or sha256(destination) != digest:
            response = requests.get(url, timeout=60)
            response.raise_for_status()
            destination.write_bytes(response.content)
        if sha256(destination) != digest:
            raise ValueError(f"Source checksum mismatch: {name}")
    assets = converter / "whisper/assets"
    assets.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(converter / "mel_filters.npz", assets / "mel_filters.npz")
    export = root / "ggml"
    export.mkdir(exist_ok=True)
    with (root / "conversion.log").open("w", encoding="utf-8") as log:
        subprocess.run([sys.executable, str(converter / "convert-h5-to-ggml.py"),
                        str(model), str(converter), str(export)], check=True,
                       stdout=log, stderr=subprocess.STDOUT, timeout=300)
    output = export / "ggml-model.bin"
    digest = sha256(output)
    manifest = dict(model="vinai/PhoWhisper-base", revision=PHO_REVISION,
                    format="GGML f16", whisper_cpp="v1.9.4", sha256=digest,
                    bytes=output.stat().st_size,
                    source_files={p.name: sha256(p) for p in model.iterdir() if p.is_file()},
                    converter_sources={n: dict(url=u, sha256=h) for n, (u, h) in SOURCES.items()})
    write_json(root / "export.json", manifest)
    # The launcher reads the checksum, never unverified weights.
    (export / "ggml-model.bin.sha256").write_text(digest + "  ggml-model.bin\n", encoding="ascii")
    print(f"Exported PhoWhisper-base GGML f16: {output}\nSHA256: {digest}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "runs/phowhisper-base-trial")
    prepare(parser.parse_args().output.resolve())
