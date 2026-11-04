"""Local Whisper draft for human correction, explicitly NOT gold labels."""
import argparse
import csv
from pathlib import Path

from evidence import sha256, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("annotations", type=Path)
    parser.add_argument("--language", choices=["vi", "en", "zh"], default="vi")
    parser.add_argument("--revision", default="main")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    import numpy as np
    import soundfile as sf
    import torch
    from huggingface_hub import snapshot_download
    from transformers import WhisperForConditionalGeneration, WhisperProcessor

    source = args.annotations.resolve()
    target = args.output.resolve() if args.output else source.with_name("annotations.draft.csv")
    if target.parent != source.parent:
        raise ValueError("Keep draft beside source annotations")
    if target.exists():
        raise ValueError("Draft already exists; refusing to overwrite corrections")
    with source.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    revision = Path(snapshot_download("openai/whisper-base", revision=args.revision,
                    allow_patterns=["*.json", "*.txt", "*.safetensors", "*.model"])).name
    torch.set_num_threads(2)
    processor = WhisperProcessor.from_pretrained("openai/whisper-base", revision=revision)
    model = WhisperForConditionalGeneration.from_pretrained("openai/whisper-base", revision=revision,
                                                           use_safetensors=True).eval()
    model.generation_config.forced_decoder_ids = None
    fields = list(rows[0]) + ["draft_text", "review_status"]
    with target.open("x", encoding="utf-8-sig", newline="") as stream, torch.inference_mode():
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for index, row in enumerate(rows):
            path = source.parent / row["audio"]
            audio, rate = sf.read(path, dtype="float32")
            if rate != 16000 or audio.ndim != 1 or not np.isfinite(audio).all():
                raise ValueError("Use prepared mono16k audio")
            features = processor.feature_extractor(audio, sampling_rate=rate, return_tensors="pt",
                                                    return_attention_mask=True)
            tokens = model.generate(**features, language=args.language, task="transcribe",
                                    return_timestamps=False, max_new_tokens=225,
                                    num_beams=1, do_sample=False)
            # text remains empty: a draft must not become a gold label implicitly.
            row.update(draft_text=processor.batch_decode(tokens, skip_special_tokens=True)[0],
                       review_status="unreviewed", language=args.language)
            writer.writerow(row)
            stream.flush()
            print(f"Drafted {index + 1}/{len(rows)}", flush=True)
    write_json(target.with_suffix(".provenance.json"), {
        "status": "unreviewed_not_training_labels", "model_id": "openai/whisper-base",
        "resolved_revision": revision, "annotations_sha256": sha256(source),
        "draft_sha256": sha256(target), "language": args.language,
        "note": "User must listen, correct terminology and fill text; source audio stays local"})


if __name__ == "__main__":
    main()
