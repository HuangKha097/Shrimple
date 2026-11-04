"""Whisper-base LoRA experiment with private per-run evidence. No serving changes."""
import argparse
import importlib.metadata
import json
import os
import platform
import subprocess
import sys
import time
import traceback
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path

from evidence import audit, score, sha256, write_json

ROOT = Path(__file__).resolve().parent

# Omitted keys retain the historical pilot behavior. New research configs declare them.
OPTIONAL_CONFIG = {"evaluation_scope": "final", "label_case": "preserve",
                   "warmup_steps": 0, "load_best_model_at_end": False}


def training_text(text, config):
    return text.lower() if config.get("label_case", "preserve") == "lower" else text


def command_output(args):
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                            errors="replace", timeout=20, check=False)
    return {"exit_code": result.returncode, "stdout": result.stdout.strip()}


def environment():
    result = {"python": sys.version, "platform": platform.platform(),
              "packages": {d.metadata["Name"]: d.version for d in importlib.metadata.distributions()}}
    for name, args in {
        "git_head": ["git", "rev-parse", "HEAD"],
        "git_status": ["git", "status", "--short"],
        "gpu": ["nvidia-smi", "--query-gpu=name,memory.total,memory.free,driver_version", "--format=csv,noheader"],
    }.items():
        try:
            result[name] = command_output(args)
        except (OSError, subprocess.TimeoutExpired) as exc:
            result[name] = {"available": False, "error_type": type(exc).__name__}
    return result


def validate_config(config):
    expected = json.loads((ROOT / "config.base-lora.json").read_text(encoding="utf-8"))
    if not set(expected) <= set(config) or set(config) - set(expected) - set(OPTIONAL_CONFIG) or config["model_id"] != "openai/whisper-base":
        raise ValueError("Use the documented Whisper-base config keys")
    for key in ("seed", "max_steps", "gradient_accumulation_steps", "eval_steps", "lora_r", "lora_alpha", "max_new_tokens"):
        if type(config[key]) is not int or config[key] < (0 if key == "seed" else 1):
            raise ValueError(f"Invalid {key}")
    if not isinstance(config["revision"], str) or not config["revision"].strip():
        raise ValueError("Model revision is required")
    if not 0 < config["learning_rate"] <= 0.01 or not 0 <= config["lora_dropout"] < 1:
        raise ValueError("Invalid learning rate/dropout")
    if config["precision"] != "fp32" or config["max_new_tokens"] > 440:
        raise ValueError("This pilot supports fp32 and <=440 generated tokens")
    if config.get("evaluation_scope", "final") not in ("development", "final"):
        raise ValueError("Invalid evaluation_scope")
    if config.get("label_case", "preserve") not in ("preserve", "lower"):
        raise ValueError("Invalid label_case")
    warmup = config.get("warmup_steps", 0)
    if type(warmup) is not int or not 0 <= warmup < config["max_steps"]:
        raise ValueError("warmup_steps must be nonnegative and less than max_steps")
    if type(config.get("load_best_model_at_end", False)) is not bool:
        raise ValueError("Invalid load_best_model_at_end")
    if config.get("load_best_model_at_end") and config["eval_steps"] > config["max_steps"]:
        raise ValueError("Best model selection needs at least one evaluation")


def train(config, records, run, device="cuda"):
    # Imports are lazy: audit works without torch, downloads, or a GPU.
    import numpy as np
    import torch
    from huggingface_hub import snapshot_download
    from peft import LoraConfig, get_peft_model
    from transformers import (Seq2SeqTrainer, Seq2SeqTrainingArguments,
                              TrainerCallback, WhisperForConditionalGeneration, WhisperProcessor, set_seed)

    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable; this training command requires a CUDA torch environment")
    set_seed(config["seed"])
    torch.set_num_threads(2)
    if device == "cuda":
        torch.cuda.reset_peak_memory_stats()
    revision = Path(snapshot_download(config["model_id"], revision=config["revision"],
                    allow_patterns=["*.json", "*.txt", "*.safetensors", "*.model"])).name
    write_json(run / "model-source.json", {"model_id": config["model_id"], "resolved_revision": revision,
               "torch_cuda": torch.version.cuda, "device": torch.cuda.get_device_name(0) if device == "cuda" else "cpu"})
    processor = WhisperProcessor.from_pretrained(config["model_id"], revision=revision)
    base = WhisperForConditionalGeneration.from_pretrained(config["model_id"], revision=revision,
                                                           use_safetensors=True).to(device)
    base.config.use_cache = False
    base.generation_config.forced_decoder_ids = None
    # Explicit generation kwargs are identical for baseline and tuned evaluation.
    generation = {"task": "transcribe", "num_beams": 1, "do_sample": False,
                  "max_new_tokens": config["max_new_tokens"], "return_timestamps": False,
                  "use_cache": True,
                  "suppress_tokens": base.generation_config.suppress_tokens,
                  "begin_suppress_tokens": base.generation_config.begin_suppress_tokens}
    write_json(run / "generation.json", generation)

    def features(row):
        # Recheck the audited bytes before every use, including evaluation.
        if sha256(row["audio"]) != row["audio_sha256"]:
            raise ValueError("Audio changed after audit")
        with wave.open(row["audio"], "rb") as wav:
            audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32) / 32768
        batch = processor.feature_extractor(audio, sampling_rate=16000, return_tensors="pt",
                                            return_attention_mask=True)
        return {key: batch[key][0] for key in ("input_features", "attention_mask")}

    def evaluate(model, split, label):
        model.eval()
        pairs, predictions, seconds = [], [], []
        with torch.inference_mode():
            for row in (r for r in records if r["split"] == split):
                inputs = {key: value.unsqueeze(0).to(device) for key, value in features(row).items()}
                if device == "cuda":
                    torch.cuda.synchronize()
                started = time.perf_counter()
                tokens = model.generate(**inputs, language=row["language"], **generation)
                if device == "cuda":
                    torch.cuda.synchronize()
                elapsed = time.perf_counter() - started
                hypothesis = processor.batch_decode(tokens, skip_special_tokens=True)[0]
                pairs.append((row["text"], hypothesis))
                seconds.append(elapsed)
                predictions.append({"id": row["id"], "language": row["language"],
                                    "reference": row["text"], "hypothesis": hypothesis,
                                    "inference_seconds": elapsed,
                                    "ended_with_eos": tokens[0, -1].item() == model.generation_config.eos_token_id,
                                    "generation_limit_reached": tokens.shape[-1] >= config["max_new_tokens"] and tokens[0, -1].item() != model.generation_config.eos_token_id})
        metrics = {**score(pairs), "samples": len(pairs), "inference_seconds": sum(seconds),
                   "latency_note": "Sequential model.generate, includes GPU work; excludes feature extraction/network/WebRTC; no warmup exclusion",
                   "by_language": {lang: score([(p["reference"], p["hypothesis"]) for p in predictions if p["language"] == lang])
                                   for lang in sorted({p["language"] for p in predictions})}}
        write_json(run / f"{label}-metrics.json", metrics)
        write_json(run / f"{label}-predictions.private.json", predictions)
        return metrics

    # Use validation to observe training; test is not used for model selection.
    development = config.get("evaluation_scope") == "development"
    baseline = None if development else evaluate(base, "test", "baseline-test")
    baseline_validation = evaluate(base, "validation", "baseline-validation")
    model = get_peft_model(base, LoraConfig(r=config["lora_r"], lora_alpha=config["lora_alpha"],
                                           lora_dropout=config["lora_dropout"],
                                           target_modules=["q_proj", "v_proj"], bias="none"))
    counts = {"trainable": sum(p.numel() for p in model.parameters() if p.requires_grad),
              "total": sum(p.numel() for p in model.parameters())}
    write_json(run / "parameters.json", counts)

    class AudioDataset(torch.utils.data.Dataset):
        def __init__(self, split):
            self.rows = [r for r in records if r["split"] == split]

        def __len__(self):
            return len(self.rows)

        def __getitem__(self, index):
            row = self.rows[index]
            # Avoid mutable tokenizer language state for mixed-language datasets.
            prefix = processor.tokenizer.get_decoder_prompt_ids(language=row["language"], task="transcribe")
            text_ids = processor.tokenizer(training_text(row["text"], config), add_special_tokens=False).input_ids
            labels = [token for _, token in prefix] + text_ids + [processor.tokenizer.eos_token_id]
            if len(labels) > base.config.max_target_positions:
                raise ValueError("Reference exceeds Whisper token limit; shorten the utterance")
            return {**features(row), "labels": labels}

    def collate(batch):
        labels = processor.tokenizer.pad([{"input_ids": b["labels"]} for b in batch], return_tensors="pt")
        return {"input_features": torch.stack([b["input_features"] for b in batch]),
                "attention_mask": torch.stack([b["attention_mask"] for b in batch]),
                "labels": labels.input_ids.masked_fill(labels.attention_mask.ne(1), -100)}

    class EvidenceCallback(TrainerCallback):
        def on_log(self, args, state, control, logs=None, **kwargs):
            with (run / "trainer-events.jsonl").open("a", encoding="utf-8") as stream:
                stream.write(json.dumps({"step": state.global_step, **(logs or {})}, allow_nan=False) + "\n")

    args = Seq2SeqTrainingArguments(output_dir=str(run / "checkpoints"),
        per_device_train_batch_size=1, per_device_eval_batch_size=1,
        gradient_accumulation_steps=config["gradient_accumulation_steps"],
        gradient_checkpointing=True, gradient_checkpointing_kwargs={"use_reentrant": False},
        learning_rate=config["learning_rate"], max_steps=config["max_steps"],
        warmup_steps=config.get("warmup_steps", 0),
        eval_strategy="steps", eval_steps=config["eval_steps"],
        save_strategy="steps", save_steps=config["eval_steps"], save_total_limit=2,
        load_best_model_at_end=config.get("load_best_model_at_end", False),
        metric_for_best_model="eval_loss" if config.get("load_best_model_at_end") else None,
        greater_is_better=False,
        logging_steps=1, report_to=[], push_to_hub=False,
        seed=config["seed"], data_seed=config["seed"], dataloader_num_workers=0,
        remove_unused_columns=False, label_names=["labels"], fp16=False, bf16=False,
        optim="adamw_torch", predict_with_generate=False, use_cpu=device == "cpu")
    trainer = Seq2SeqTrainer(model=model, args=args, train_dataset=AudioDataset("train"),
        eval_dataset=AudioDataset("validation"), data_collator=collate, callbacks=[EvidenceCallback()])
    train_result = trainer.train()
    write_json(run / "train-metrics.json", train_result.metrics)
    trainer.save_state()
    model.save_pretrained(run / "adapter", safe_serialization=True)
    # Merge adapters before converting to whisper.cpp; deployment is a separate gate.
    model.gradient_checkpointing_disable()
    tuned = model.merge_and_unload()
    tuned.config.use_cache = True
    tuned.save_pretrained(run / "merged", safe_serialization=True)
    processor.save_pretrained(run / "merged")
    validation = evaluate(tuned, "validation", "tuned-validation")
    test = None if development else evaluate(tuned, "test", "tuned-test")
    write_json(run / "comparison.json", {"baseline_test": baseline, "tuned_test": test,
        "baseline_validation": baseline_validation, "tuned_validation": validation,
        "evaluation_scope": "development" if development else "final",
        "test_wer_change_percentage_points": None if development else test["wer_percent"] - baseline["wer_percent"],
        "validation_wer_change_percentage_points": validation["wer_percent"] - baseline_validation["wer_percent"],
        "selected_checkpoint": trainer.state.best_model_checkpoint if config.get("load_best_model_at_end") else "final_step",
        "checkpoint_selection_metric": "validation_loss" if config.get("load_best_model_at_end") else None,
        "peak_allocated_vram_bytes": torch.cuda.max_memory_allocated() if device == "cuda" else None,
        "acceptance": "Experiment completed; no automatic quality/deployment acceptance",
        "quantization": "HF fp32 comparison only; repeat comparison after GGML q5_1 export"})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["audit", "train"])
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--config", type=Path, default=ROOT / "config.base-lora.json")
    parser.add_argument("--runs", type=Path, default=ROOT / "runs")
    parser.add_argument("--device", choices=["cuda", "cpu"], default="cuda")
    parser.add_argument("--purpose", choices=["research", "smoke"], default="research")
    args = parser.parse_args()
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    run = args.runs / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    run.mkdir(parents=True, exist_ok=False)
    state = {"command": args.command, "purpose": args.purpose, "device": args.device,
             "started_utc": datetime.now(timezone.utc).isoformat(), "status": "running"}
    write_json(run / "status.json", state)
    print(f"Private evidence directory: {run.resolve()}")
    try:
        write_json(run / "environment.json", environment())
        sources = sorted([*ROOT.glob("*.py"), ROOT / "requirements.txt"])
        (run / "source-snapshot").mkdir()
        for source in sources:
            (run / "source-snapshot" / source.name).write_bytes(source.read_bytes())
        write_json(run / "source-sha256.json", {p.name: sha256(p) for p in sources})
        config = {**OPTIONAL_CONFIG, **json.loads(args.config.read_text(encoding="utf-8-sig"))}
        validate_config(config)
        write_json(run / "config.json", config)
        records, summary = audit(args.manifest, development=config["evaluation_scope"] == "development")
        write_json(run / "dataset-summary.json", summary)
        write_json(run / "dataset-snapshot.private.json", records)
        if args.command == "train":
            train(config, records, run, args.device)
        state["status"] = "audit_passed" if args.command == "audit" else "experiment_completed"
        return 0
    except BaseException as exc:
        state.update(status="interrupted" if isinstance(exc, KeyboardInterrupt) else "failed",
                     error_type=type(exc).__name__)
        # Detailed errors can include private paths/text; kept only in ignored runs.
        (run / "error.private.txt").write_text(traceback.format_exc(), encoding="utf-8")
        print(f"{state['status']}: {type(exc).__name__}; see private evidence", file=sys.stderr)
        return 130 if isinstance(exc, KeyboardInterrupt) else 1
    finally:
        state["finished_utc"] = datetime.now(timezone.utc).isoformat()
        write_json(run / "status.json", state)
        write_json(run / "artifacts-sha256.json", {str(p.relative_to(run)): sha256(p)
                   for p in sorted(run.rglob("*")) if p.is_file() and p.name != "artifacts-sha256.json"})


if __name__ == "__main__":
    raise SystemExit(main())
