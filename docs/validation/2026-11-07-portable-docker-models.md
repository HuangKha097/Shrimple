# Docker model portability — 07/11/2026

Scope: QS-I23 / QS-AI01, fix missing PhoWhisper artifacts on a second machine.
Q01/Q03 and microphone/WebRTC acceptance remain open. No commit/push/deploy.

## Cause and changes

The previous Compose bind-mounted `training/runs/phowhisper-base-trial/ggml`.
That directory is intentionally ignored by Git. A fresh pull cannot supply its
GGML/checksum files, so `start.sh` exits before the health endpoint is available.
The supplied screenshot only shows unhealthy; no remote container log was supplied
to exclude other causes on that machine.

- Keep private datasets/checkpoints ignored. Add an explanatory `.gitignore` comment.
- CPU and CUDA Dockerfiles now use a separate Python build stage to download
  `vinai/PhoWhisper-base` revision `7ebdb9e88f5cc5271fb88f4d642c82ff9388650e`.
- Tracked `ai-service/whisper/phowhisper.json` contains source/converter checksums,
  expected output size and the existing serving-model hash. No private training data.
- `prepare-model.py` verifies each input before conversion and verifies the final
  GGML against the existing serving model. Build fails on any checksum mismatch.
- Only the GGML and sidecar are copied into `/opt/phowhisper` in the runtime image.
  Host Python/PyTorch and local training artifacts are unnecessary.
- Remove both research-model bind mounts from Compose. Default app/Compose
  punctuation to `rules`, since the local ViMD classifier metadata says no
  redistribution. Model-mode implementation and local research files are retained.
  HTTP Vietnamese finals now apply rules as well as PCM finals. This changes
  punctuation quality; the earlier classifier benchmark is not evidence for rules.
- Exclude training data/runs/venvs from the AI Docker context, independently of Git.
- Disable native-host CPU tuning (`GGML_NATIVE=OFF`) in the CPU image.

## Verification

- `docker compose config --quiet`: pass.
- `docker compose -f compose.yaml -f compose.gpu.yaml config --quiet`: pass.
- `bash -n ai-service/whisper/start.sh`: pass outside Windows sandbox.
- AI tests using `training/.venv-check/Scripts/python.exe -m unittest discover
  -s tests -p 'test_*.py'` from `ai-service`: **22/22 pass**. A Starlette/httpx
  deprecation warning remains. Sandbox blocks asyncio socketpair initialization;
  rerun outside sandbox passed in 1.941 seconds.
- New downloader regression uses local file URLs: accepts verified bytes, rejects
  and deletes a corrupted download. No network/model fixture required.
- Actual full conversion with the new build script using checksum-verified cached
  public source files: pass. Output matches **147,951,482 bytes**, SHA-256
  `d2d55964ba390fdbd32642a36555961df7fe3a171c41c841e4257f46a157c367`.
  Tested with torch 2.6.0+cu124, transformers 4.57.1, numpy 2.5.4 on Windows;
  this is not a Linux CPU-image build result.
- Docker Engine is unavailable at `dockerDesktopLinuxEngine`; clean image build,
  build-stage downloads, CPU torch/numpy combination in Linux, container health
  and second-machine startup remain unverified.

## Running on another machine

After these changes are committed/pushed and pulled, with Docker Desktop Linux
Engine, internet access and the existing env/MongoDB setup:

```powershell
docker compose up -d --build
docker compose ps
```

No manual model transfer is required by this configuration. First build downloads
CPU PyTorch and the public PhoWhisper checkpoint; it needs more time/disk/network
than an already-cached build. English Whisper/Qwen still download/cache at startup.
Secrets and external MongoDB/service credentials are not tracked or auto-provisioned.
Do not force-add `training/runs/` or `.env` to Git.
