"""Export only aggregate accent evidence; keep audio and transcripts private."""
import argparse
import csv
import json
import shutil
from collections import defaultdict
from pathlib import Path

from analyze_asr import aggregate, edits
from evidence import sha256, write_json

SOURCE_NOTES = {
    "linhtran92/viet_bud500": {"role": "candidate_training_pool", "documented_hours_approx": 500,
        "speaker_metadata": False, "accent_metadata": False,
        "decision": "blocked_no_user_access; cannot construct speaker-disjoint regional benchmark from documented audio/transcription schema",
        "license_note": "HF metadata CC-BY-NC-SA-4.0 conflicts with README Apache paragraph; clarify dataset terms; code licence is not audio rights",
        "source_url": "https://github.com/apluka34/Bud500"},
    "nguyendv02/ViMD_Dataset": {"role": "best_metadata_fit_for_regional_benchmark_candidate",
        "documented_hours_approx": 102.56, "speaker_metadata": True, "accent_metadata": True,
        "decision": "bounded_valid_only_evaluation; no_training_or_audio_transcript_redistribution",
        "license_note": "Dataset CC-BY-NC-ND-4.0 is not a blanket private-evaluation ban; no model redistribution/commercial-use decision made; paper licence is separate",
        "source_url": "https://aclanthology.org/2024.emnlp-main.426/"},
    "leduckhai/VietMed": {"role": "open_small_medical_domain_diagnostic",
        "documented_labelled_hours_approx": 16, "speaker_metadata": True, "accent_metadata": True,
        "decision": "bounded_train_dev_acquired; no_test; not_ready_for_balanced_NCS_training",
        "license_note": "MIT declared by publisher; retain attribution; no independent rights verification",
        "limitations": "Medical domain; observed dev labels North, South East, South West, Central Highland. No coastal Central label. October 2026 references corrected; pin revision.",
        "source_url": "https://huggingface.co/datasets/leduckhai/VietMed"},
    "google/fleurs": {"role": "candidate_external_general_ASR_diagnostic_vi_vn",
        "speaker_metadata": False, "accent_metadata": False, "decision": "metadata_only; not_region_benchmark_ready",
        "license_note": "CC-BY-4.0 declared. Global repo bytes are not Vietnamese-subset bytes.",
        "source_url": "https://huggingface.co/datasets/google/fleurs"},
    "NhutP/VietSpeech": {"role": "candidate_large_training_pool", "documented_hours_approx": 1100,
        "speaker_metadata": False, "accent_metadata": False, "decision": "blocked_no_user_access; documented schema insufficient for regional speaker splits",
        "license_note": "Apache-2.0 declared; source/audio rights still require review",
        "source_url": "https://huggingface.co/datasets/NhutP/VietSpeech"},
    "speechcolab/gigaspeech2": {"role": "future_weak_supervision_training_pool",
        "documented_Vietnamese_refined_hours_approx": 6000, "decision": "gated_custom_terms; not_acquired",
        "speaker_metadata": "not_verified_for_Vietnamese", "accent_metadata": False,
        "license_note": "Apache metadata is not the complete gated underlying-audio agreement; training labels are automatic, human dev/test separate",
        "source_url": "https://huggingface.co/datasets/speechcolab/gigaspeech2"},
}


def export(snapshots, data, run, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    output.mkdir(parents=True, exist_ok=False)
    catalog = []
    for folder in sorted(snapshots.iterdir()):
        if not folder.is_dir():
            continue
        metadata_path = folder / "metadata.json"
        meta = json.loads(metadata_path.read_text(encoding="utf-8"))
        repo = meta["repo_id"]
        catalog.append({"repo_id": repo, "url": "https://huggingface.co/datasets/" + repo,
            "revision": meta["revision"], "gated": meta["gated"], "declared_license": meta["license_metadata"],
            "known_entire_repo_bytes_not_subset_or_download_requirement": meta["known_repo_bytes"],
            "metadata_snapshot_sha256": sha256(metadata_path), "readme_snapshot_sha256": sha256(folder / "README.source.md"),
            **SOURCE_NOTES[repo]})
    catalog.append({"repo_id": "VLSP_resources", "url": "https://vlsp.org.vn/index.php/resources",
        "decision": "blocked_no_user_access; signed general form and email required; no message sent",
        "declared_license": "per_dataset_agreement_not_yet_obtained", "speaker_metadata": "unknown", "accent_metadata": "unknown"})
    write_json(output / "sources.registry.json", {"observed_date": "2026-11-03", "sources": catalog,
        "auto_training_permitted": False, "note": "Metadata/card declarations, not independent rights or label-quality verification. No gated terms accepted for user."})
    for name, source in (("summary.json", run / "summary.json"), ("groups.csv", run / "groups.csv"),
                         ("profile.json", data / "profile.json"), ("balanced-training-plan.json", data / "balanced-training-plan.json"),
                         ("environment.json", run / "environment.json"), ("run-status.json", run / "status.json")):
        shutil.copyfile(source, output / name)
    summary = json.loads((run / "summary.json").read_text(encoding="utf-8"))
    rows = [json.loads(line) for line in (data / "benchmark.manifest.jsonl").read_text(encoding="utf-8").splitlines()]
    predictions = json.loads((run / "predictions.private.json").read_text(encoding="utf-8"))
    by_id = {p["id"]: p for p in predictions}
    merged = [{**row, **by_id[row["id"]]} for row in rows]
    groups, speakers = defaultdict(list), defaultdict(list)
    for row in merged:
        groups[row["accent"]].append(row)
        speakers[row["speaker_id"]].append(row)
    write_json(output / "error-counts.json", {key: aggregate(group) for key, group in groups.items()})
    write_json(run / "error-cases.private.json", [{"id": r["id"], "accent": r["accent"],
        "speaker_id": r["speaker_id"], "reference": r["reference"], "hypothesis": r["hypothesis"],
        "operations": edits(r["reference"], r["hypothesis"])} for r in merged])
    with (output / "speakers.csv").open("x", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["speaker_hash", "accent", "samples", "seconds", "wer_percent", "cer_percent"])
        for speaker, group in sorted(speakers.items()):
            metrics = aggregate(group)
            writer.writerow([speaker, group[0]["accent"], len(group), sum(r["duration_seconds"] for r in group),
                             metrics["wer_percent"], metrics["cer_percent"]])
    fig, axis = plt.subplots(figsize=(9, 4.7), layout="constrained")
    labels = ["north", "central", "south", "central_highlands", "fast", "heavy"]
    for index, label in enumerate(labels):
        group = summary["groups"][label]
        if group["metrics"] is None:
            axis.text(index, 2, "NOT MEASURED", rotation=90, va="bottom", ha="center", color="#667085", fontsize=9)
        else:
            value = group["metrics"]["wer_percent"]
            axis.bar(index, value, color="#287B9F" if label != "central_highlands" else "#9E7700")
            axis.text(index, value + 1, f"{value:.2f}%\nn={group['samples']}, spk={group['speakers']}", ha="center", fontsize=9)
    axis.set_xticks(range(len(labels)), ["North", "Central", "South", "Central Highlands", "Natural fast", "Heavy accent"])
    axis.set_ylabel("WER (%) — source transcripts")
    axis.set_ylim(0, max(g["metrics"]["wer_percent"] for g in summary["groups"].values() if g["metrics"]) + 18)
    domains = ", ".join(sorted({r.get("domain", "unknown") for r in rows}))
    axis.set_title(f"Whisper-base | Development diagnostic ({domains})\n{len(rows)} clips / {summary['overall']['speakers']} speakers; coverage limitations apply")
    axis.spines[["top", "right"]].set_visible(False)
    fig.savefig(output / "accent-baseline.png", dpi=160)
    plt.close(fig)
    write_json(output / "provenance.json", {"private_run": run.name, "manifest_sha256": sha256(data / "benchmark.manifest.jsonl"),
        "predictions_sha256": sha256(run / "predictions.private.json"),
        "evaluation_used_script_sha256": summary["source_script_sha256"],
        "preparation_used_script_sha256": json.loads((data / "profile.json").read_text(encoding="utf-8"))["script_sha256"],
        "report_time_source_sha256": {name: sha256(Path(__file__).with_name(name)) for name in
            ("accent_benchmark.py", "benchmark.protocol.json", "evaluate_accent.py", "prepare_vietmed.py", "prepare_vimd.py", "report_accent.py", "evidence.py", "analyze_asr.py")},
        "raw_audio_transcripts_exported": False, "test_evaluated": False, "trained_model_created": False})
    write_json(output / "artifacts-sha256.json", {p.name: sha256(p) for p in output.iterdir() if p.is_file()})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("snapshots", "data", "run", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    export(args.snapshots, args.data, args.run, args.output)
