"""Acquire bounded official ViMD train shards, after region-only metadata probes."""
import argparse
import io
import json
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from evidence import sha256, write_json
from prepare_vimd import REPO, REVISION


class RangeReader(io.RawIOBase):
    def __init__(self, url, size):
        self.url, self.size, self.position, self.received = url, size, 0, 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else self.position + offset if whence == 1 else self.size + offset
        return self.position

    def read(self, count=-1):
        import requests
        count = min(count if count >= 0 else self.size - self.position, self.size - self.position)
        if count <= 0:
            return b""
        if count > 1024 * 1024 or self.received + count > 8 * 1024 * 1024:
            raise ValueError("Metadata range budget exceeded")
        with requests.get(self.url, headers={"Range": f"bytes={self.position}-{self.position + count - 1}"},
                          stream=True, timeout=(20, 30)) as response:
            if response.status_code != 206:
                raise ValueError("Remote server did not honor Range")
            content = response.raw.read(count + 1)
        if len(content) != count:
            raise ValueError("Invalid range length")
        self.position += count
        self.received += count
        return content


def acquire(metadata, output):
    import pyarrow.parquet as pq
    import requests

    meta = json.loads(metadata.read_text(encoding="utf-8"))
    if meta["revision"] != REVISION or meta["gated"] is not False:
        raise ValueError("Require pinned ungated source")
    sizes = {r["path"]: r["bytes"] for r in meta["files"]}
    output.mkdir(parents=True, exist_ok=False)
    base = f"https://huggingface.co/datasets/{REPO}/resolve/{REVISION}/"

    def probe(index):
        relative = f"data/train-{index:05d}-of-00103.parquet"
        remote = RangeReader(base + relative, sizes[relative])
        table = pq.read_table(remote, columns=["region", "province_name"])
        return {"path": relative, "regions": dict(Counter(table["region"].to_pylist())),
                "provinces": sorted(set(table["province_name"].to_pylist())),
                "metadata_bytes_read": remote.received, "bytes": sizes[relative]}

    with ThreadPoolExecutor(max_workers=3) as pool:
        probes = list(pool.map(probe, (0, 36, 50)))
    write_json(output / "region-probes.json", probes)
    selected = {}
    for region in ("North", "Central", "South"):
        choices = [p for p in probes if p["regions"].get(region, 0) >= 60]
        if not choices:
            raise ValueError(f"Probed train shards lack enough {region} samples; inspect metadata before more downloads")
        selected[region] = max(choices, key=lambda p: p["regions"].get(region, 0))["path"]
    paths = sorted(set(selected.values()))
    if sum(sizes[p] for p in paths) > 1_600_000_000:
        raise ValueError("Acquisition exceeds 1.6GB budget")
    record = {"repo": REPO, "revision": REVISION, "split": "train", "selected_by_region": selected,
        "files": [], "metadata_sha256": sha256(metadata), "script_sha256": sha256(Path(__file__)),
        "license_declared": "CC-BY-NC-ND-4.0", "use": "User-requested private non-commercial academic fine-tuning; no model/data publication or deployment",
        "test_read": False, "validation_downloaded": False}
    for relative in paths:
        path = output / Path(relative).name
        received = 0
        with requests.get(base + relative, stream=True, timeout=(20, 45)) as response:
            response.raise_for_status()
            with path.open("xb") as stream:
                for chunk in response.iter_content(1024 * 1024):
                    received += len(chunk)
                    if received > sizes[relative]:
                        raise ValueError("Download exceeds pinned file size")
                    stream.write(chunk)
        if received != sizes[relative]:
            raise ValueError("Incomplete shard")
        record["files"].append({"path": relative, "local_name": path.name, "bytes": received, "sha256": sha256(path)})
        write_json(output / "acquisition.json", record)
        print(f"Acquired {path.name}: {received} bytes", flush=True)
    write_json(output / "status.json", {"status": "completed", "files": len(paths), "test_read": False})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    acquire(args.metadata, args.output)
