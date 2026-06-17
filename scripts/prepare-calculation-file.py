#!/usr/bin/env python3
"""Prepare SINE Pixel Viewer pairwise-alignment JSON from FASTA records."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


DNA_PATTERN = re.compile(r"^[ACGTNRYKMSWBDHV]+$", re.IGNORECASE)
GAP = "-"
MODES = {"full", "sub_del", "sub_only"}


def parse_fasta(path: Path, fallback_prefix: str) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    current_id = ""
    chunks: list[str] = []

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith(">"):
            if current_id or chunks:
                records.append({"id": current_id or f"{fallback_prefix}_{len(records) + 1}", "sequence": "".join(chunks).upper()})
            current_id = line[1:].strip().split()[0] or f"{fallback_prefix}_{len(records) + 1}"
            chunks = []
        else:
            chunks.append("".join(line.split()))

    if current_id or chunks:
        records.append({"id": current_id or f"{fallback_prefix}_{len(records) + 1}", "sequence": "".join(chunks).upper()})

    if not records:
        raise ValueError(f"No FASTA records found in {path}")

    return records


def validate_dna(record: dict[str, str]) -> None:
    if not record["id"].strip():
        raise ValueError("Missing FASTA id")
    if not record["sequence"]:
        raise ValueError(f"Sequence {record['id']} is empty")
    if not DNA_PATTERN.match(record["sequence"]):
        raise ValueError(f"Sequence {record['id']} contains non-DNA characters")


def read_single_consensus(path: Path) -> dict[str, str]:
    records = parse_fasta(path, "consensus")
    if len(records) != 1:
        raise ValueError(f"Expected exactly one consensus sequence, found {len(records)}")
    validate_dna(records[0])
    return records[0]


def align_needleman_wunsch(consensus: str, query: str, mode: str) -> tuple[list[str], list[str]]:
    rows = len(consensus) + 1
    columns = len(query) + 1
    insertion_penalty = -10 if mode == "sub_del" else -2
    deletion_penalty = -2
    scores = [[float("-inf")] * columns for _ in range(rows)]
    directions = [[""] * columns for _ in range(rows)]
    scores[0][0] = 0

    for row in range(1, rows):
        scores[row][0] = scores[row - 1][0] + deletion_penalty
        directions[row][0] = "up"
    for column in range(1, columns):
        scores[0][column] = scores[0][column - 1] + insertion_penalty
        directions[0][column] = "left"

    for row in range(1, rows):
        for column in range(1, columns):
            match_score = 1 if consensus[row - 1] == query[column - 1] else -1
            diag = scores[row - 1][column - 1] + match_score
            up = scores[row - 1][column] + deletion_penalty
            left = scores[row][column - 1] + insertion_penalty
            best = max(diag, up, left)
            scores[row][column] = best
            directions[row][column] = "diag" if best == diag else "up" if best == up else "left"

    aligned_consensus: list[str] = []
    aligned_query: list[str] = []
    row = len(consensus)
    column = len(query)

    while row > 0 or column > 0:
        direction = directions[row][column]
        if direction == "diag":
            aligned_consensus.insert(0, consensus[row - 1])
            aligned_query.insert(0, query[column - 1])
            row -= 1
            column -= 1
        elif direction == "up":
            aligned_consensus.insert(0, consensus[row - 1])
            aligned_query.insert(0, GAP)
            row -= 1
        else:
            aligned_consensus.insert(0, GAP)
            aligned_query.insert(0, query[column - 1])
            column -= 1

    return aligned_consensus, aligned_query


def direct_comparison(consensus: str, query: str) -> tuple[list[str], list[str]]:
    aligned_consensus: list[str] = []
    aligned_query: list[str] = []
    length = max(len(consensus), len(query))
    for index in range(length):
        aligned_consensus.append(consensus[index] if index < len(consensus) else GAP)
        aligned_query.append(query[index] if index < len(query) else GAP)
    return aligned_consensus, aligned_query


STATE_MAP = {"match": "M", "mismatch": "X", "del": "D"}


def project_alignment(
    record: dict[str, str],
    consensus: str,
    aligned_consensus: list[str],
    aligned_query: list[str],
    mode: str,
    max_ins_length: int,
    max_del_length: int,
) -> dict[str, object]:
    """Project alignment into compact states+bases format (NOT verbose pixel objects)."""
    consensus_len = len(consensus)
    states = ["M"] * consensus_len  # default: all matches
    bases: dict[str, str] = {}
    insertions_dict: dict[str, list[str]] = {}
    consensus_pos = 0
    current_insertion_anchor = 0
    current_insertion_offset = 0
    mismatches = 0
    deletions = 0
    deletion_run_length = 0
    insertions = 0
    observed_consensus_columns = 0

    for consensus_base, query_base in zip(aligned_consensus, aligned_query):
        if consensus_base == GAP:
            insertions += 1
            current_insertion_offset += 1
            deletion_run_length = 0
            if (mode == "full" or mode == "sub_only") and current_insertion_offset <= max_ins_length:
                key = str(current_insertion_anchor)
                if key not in insertions_dict:
                    insertions_dict[key] = []
                insertions_dict[key].append(query_base)
            continue

        consensus_pos += 1
        current_insertion_anchor = consensus_pos
        current_insertion_offset = 0
        idx = consensus_pos - 1

        if query_base == GAP:
            deletions += 1
            deletion_run_length += 1
            if deletion_run_length <= max_del_length:
                states[idx] = "D"
                bases[str(consensus_pos)] = GAP
            else:
                states[idx] = "."
            continue

        deletion_run_length = 0
        observed_consensus_columns += 1
        if query_base == consensus_base:
            # Match – already "M" by default
            pass
        else:
            mismatches += 1
            states[idx] = "X"
            bases[str(consensus_pos)] = query_base

    denominator = consensus_len or 1
    if mode == "sub_only":
        # sub_only uses direct comparison: alignment is max(consensus, query) positions.
        # Denominator must be the full alignment length to keep divergence ≤ 100 %.
        denominator = len(aligned_query) or 1
    indels = insertions + deletions
    result: dict[str, object] = {
        "id": record["id"],
        "states": "".join(states),
        "raw": record["sequence"],  # original raw query for mode switching
        "divergence": ((mismatches + indels) / denominator) * 100,
        "divergenceSubstitution": (mismatches / denominator) * 100,
        "divergenceIndel": (indels / denominator) * 100,
        "alignedCoverage": (observed_consensus_columns / denominator) * 100,
        "numIndels": indels,
        "length": len(record["sequence"]),
    }
    if bases:
        result["bases"] = bases
    if insertions_dict:
        result["insertions"] = {k: "".join(v) for k, v in insertions_dict.items()}
    return result


def calculate(args: argparse.Namespace) -> dict[str, object]:
    consensus_record, sequence_records = load_inputs(args)
    for record in sequence_records:
        validate_dna(record)

    consensus = consensus_record["sequence"]
    min_length = int(len(consensus) * args.min_sequence_length_ratio + 0.999999)
    lengths = [len(record["sequence"]) for record in sequence_records]
    retained_records = [record for record in sequence_records if len(record["sequence"]) >= min_length]
    alignments = []

    for record in retained_records:
        if args.mode == "sub_only":
            aligned_consensus, aligned_query = direct_comparison(consensus, record["sequence"])
        else:
            aligned_consensus, aligned_query = align_needleman_wunsch(consensus, record["sequence"], args.mode)
        alignments.append(project_alignment(
            record,
            consensus,
            aligned_consensus,
            aligned_query,
            args.mode,
            args.max_ins_length,
            args.max_del_length,
        ))

    return {
        "consensusId": consensus_record["id"],
        "consensus": consensus,
        "consensusLength": len(consensus),
        "numSequences": len(alignments),
        "mode": args.mode,
        "format": "compact",
        "sequences": alignments,
        "stats": {
            "sequenceCount": len(sequence_records),
            "retainedCount": len(alignments),
            "skippedCount": len(sequence_records) - len(alignments),
            "minLength": min(lengths) if lengths else 0,
            "maxLength": max(lengths) if lengths else 0,
            "meanLength": sum(lengths) / len(lengths) if lengths else 0,
        },
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "parameters": {
            "mode": args.mode,
            "maxInsLength": args.max_ins_length,
            "maxDelLength": args.max_del_length,
            "minSequenceLengthRatio": args.min_sequence_length_ratio,
        },
    }


def load_inputs(args: argparse.Namespace) -> tuple[dict[str, str], list[dict[str, str]]]:
    if len(args.paths) == 3:
        consensus_path, copies_path, output_path = args.paths
        args.output = output_path
        if args.consensus_id:
            raise ValueError("--consensus-id is only used with the single multifasta form")
        return read_single_consensus(consensus_path), parse_fasta(copies_path, "copy")

    if len(args.paths) != 2:
        raise ValueError("Expected either: multifasta.fa output.json OR consensus.fa copies.fa output.json")

    multifasta_path, output_path = args.paths
    args.output = output_path
    records = parse_fasta(multifasta_path, "record")
    consensus_index = 0

    if args.consensus_id:
        matching_indices = [index for index, record in enumerate(records) if record["id"] == args.consensus_id]
        if not matching_indices:
            raise ValueError(f"No FASTA record with id {args.consensus_id!r} found in {multifasta_path}")
        consensus_index = matching_indices[0]

    consensus_record = records[consensus_index]
    validate_dna(consensus_record)
    if args.include_consensus_copy:
        sequence_records = records
    else:
        sequence_records = [record for index, record in enumerate(records) if index != consensus_index]

    if not sequence_records:
        raise ValueError("No SINE copy records remain after selecting the consensus/reference record")

    return consensus_record, sequence_records


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare SINE Pixel Viewer calculation JSON from pairwise alignments.")
    parser.add_argument(
        "paths",
        nargs="+",
        type=Path,
        help="Either: multifasta.fa output.json OR consensus.fa copies.fa output.json",
    )
    parser.add_argument("--consensus-id", help="Consensus/reference record id in the single multifasta form; defaults to the first record")
    parser.add_argument("--include-consensus-copy", action="store_true", help="Also align the selected consensus/reference record as a copy")
    parser.add_argument("--mode", choices=sorted(MODES), default="sub_del", help="Alignment mode")
    parser.add_argument("--max-ins-length", type=int, default=50, help="Maximum retained insertion length in full mode")
    parser.add_argument("--max-del-length", type=int, default=100, help="Maximum retained deletion run length")
    parser.add_argument("--min-sequence-length-ratio", type=float, default=0.5, help="Minimum copy length as a ratio of consensus length")
    parser.add_argument("--compact", action="store_true", help="Write compact JSON instead of pretty JSON")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.max_ins_length < 0 or args.max_del_length < 0:
        raise SystemExit("max insertion/deletion lengths must be non-negative")
    if args.min_sequence_length_ratio < 0:
        raise SystemExit("min sequence length ratio must be non-negative")

    try:
        data = calculate(args)
    except ValueError as error:
        raise SystemExit(str(error)) from error

    output_path = args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if args.compact:
        output_path.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")
    else:
        output_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {data['numSequences']} alignments against {data['consensusId']} "
        f"({data['consensusLength']} bp) to {output_path}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()