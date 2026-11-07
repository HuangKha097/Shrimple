"""Checksum boundary for Docker's public-model downloader (no network)."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    'prepare_model', Path(__file__).resolve().parents[1] / 'whisper/prepare-model.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ModelDownloadTests(unittest.TestCase):
    def test_verified_download_and_corrupted_download(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'public-model.bin'
            source.write_bytes(b'checkpoint')
            target = root / 'download/model.bin'
            digest = hashlib.sha256(b'checkpoint').hexdigest()
            builder.fetch(source.as_uri(), target, digest)
            self.assertEqual(target.read_bytes(), b'checkpoint')
            source.write_bytes(b'changed checkpoint')
            with self.assertRaisesRegex(ValueError, 'Checksum mismatch'):
                builder.fetch(source.as_uri(), target, digest)
            self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
