"""Build-only export of pinned PhoWhisper weights; no research data required."""
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.request import urlopen


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(url, destination, expected):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(url, timeout=120) as source, destination.open('wb') as target:
        shutil.copyfileobj(source, target)
    if sha256(destination) != expected:
        destination.unlink()
        raise ValueError(f'Checksum mismatch: {destination.name}')


def prepare(root, manifest):
    model = root / 'model'
    converter = root / 'converter'
    output = root / 'ggml'
    output.mkdir(parents=True, exist_ok=True)
    for name, checksum in manifest['source_files'].items():
        fetch(f"https://huggingface.co/{manifest['model']}/resolve/{manifest['revision']}/{name}",
              model / name, checksum)
    for name, source in manifest['converter_sources'].items():
        fetch(source['url'], converter / name, source['sha256'])
    assets = converter / 'whisper/assets'
    assets.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(converter / 'mel_filters.npz', assets / 'mel_filters.npz')
    subprocess.run([sys.executable, str(converter / 'convert-h5-to-ggml.py'),
                    str(model), str(converter), str(output)], check=True, timeout=600)
    weights = output / 'ggml-model.bin'
    if weights.stat().st_size != manifest['bytes'] or sha256(weights) != manifest['sha256']:
        raise ValueError('Exported PhoWhisper does not match the serving checkpoint')
    (output / 'ggml-model.bin.sha256').write_text(
        manifest['sha256'] + '  ggml-model.bin\n', encoding='ascii')


if __name__ == '__main__':
    manifest = json.loads(Path(__file__).with_name('phowhisper.json').read_text(encoding='utf-8'))
    prepare(Path('/build'), manifest)
