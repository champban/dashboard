#!/usr/bin/env python3
"""Exact AICC COPY/restored-count reconciliation for the L1B B-2 drill."""

from __future__ import annotations

import argparse
import hashlib
import os
import pathlib
import re
import sys
import tempfile

AICC_TABLES = (
    "aicc_agent_credentials",
    "aicc_agents",
    "aicc_events",
    "aicc_messages",
    "aicc_project_members",
    "aicc_projects",
    "aicc_sessions",
    "aicc_tasks",
)
AICC_SET = set(AICC_TABLES)
COPY_HEADER = re.compile(
    r'^COPY\s+(?P<relation>(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)'
    r'\.(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*))\s+\('
)


def required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ValueError(f"required contract variable is absent: {name}")
    return value


def normalize_relation(value: str) -> tuple[str, str]:
    parts = tuple(part.strip('"') for part in value.split("."))
    if len(parts) != 2:
        raise ValueError("COPY relation is not schema-qualified")
    return parts[0], parts[1]


def write_counts(path: pathlib.Path, counts: dict[str, int]) -> None:
    if set(counts) != AICC_SET:
        raise ValueError("AICC count map does not contain the exact table inventory")
    with path.open("x", encoding="utf-8", newline="\n") as handle:
        for table in AICC_TABLES:
            handle.write(f"{table}\t{counts[table]}\n")
    path.chmod(0o600)


def extract_counts(data_sql: pathlib.Path, output: pathlib.Path) -> dict[str, int]:
    if data_sql.is_symlink() or not data_sql.is_file():
        raise ValueError("data.sql is absent or unsafe")
    if output.exists() or output.is_symlink():
        raise ValueError("AICC output path already exists or is unsafe")

    counts: dict[str, int] = {}
    active: str | None = None
    with data_sql.open("r", encoding="utf-8", errors="strict", newline="") as handle:
        for raw_line in handle:
            line = raw_line.rstrip("\r\n")
            if active is not None:
                if line == r"\.":
                    active = None
                else:
                    counts[active] += 1
                continue

            match = COPY_HEADER.match(line)
            if match is None:
                continue
            schema, table = normalize_relation(match.group("relation"))
            if schema != "public" or not table.startswith("aicc_"):
                continue
            if table not in AICC_SET:
                raise ValueError(f"unexpected AICC COPY section: {table}")
            if table in counts:
                raise ValueError(f"duplicate AICC COPY section: {table}")
            counts[table] = 0
            active = table

    if active is not None:
        raise ValueError(f"unterminated AICC COPY section: {active}")
    missing = sorted(AICC_SET - set(counts))
    if missing:
        raise ValueError("missing AICC COPY sections: " + ", ".join(missing))
    write_counts(output, counts)
    return counts


def read_counts(path: pathlib.Path) -> dict[str, int]:
    if path.is_symlink() or not path.is_file():
        raise ValueError("AICC count file is absent or unsafe")
    counts: dict[str, int] = {}
    with path.open("r", encoding="utf-8", errors="strict") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            parts = raw_line.rstrip("\r\n").split("\t")
            if len(parts) != 2 or parts[0] not in AICC_SET:
                raise ValueError(f"invalid AICC count record at line {line_number}")
            if parts[0] in counts or not parts[1].isdigit():
                raise ValueError(f"invalid AICC count value at line {line_number}")
            counts[parts[0]] = int(parts[1])
    if set(counts) != AICC_SET:
        raise ValueError("AICC count file does not contain the exact table inventory")
    return counts


def count_fingerprint(counts: dict[str, int]) -> tuple[int, str]:
    payload = "\n".join(f"{table}|{counts[table]}" for table in AICC_TABLES)
    return len(AICC_TABLES), hashlib.md5(payload.encode("utf-8")).hexdigest()


def verify_frozen(path: pathlib.Path) -> None:
    counts = read_counts(path)
    parts, fingerprint = count_fingerprint(counts)
    expected_parts = int(required_env("EXPECTED_AICC_ROW_COUNT_PARTS"))
    expected_fingerprint = required_env("EXPECTED_AICC_ROW_COUNT_FINGERPRINT")
    if parts != expected_parts or fingerprint != expected_fingerprint:
        raise ValueError("AICC row-count fingerprint differs from frozen Production evidence")


def compare_counts(expected: pathlib.Path, actual: pathlib.Path) -> None:
    left = read_counts(expected)
    right = read_counts(actual)
    mismatches = [table for table in AICC_TABLES if left[table] != right[table]]
    if mismatches:
        raise ValueError("AICC restored row-count mismatch: " + ", ".join(mismatches))


def fixture(counts: dict[str, int]) -> str:
    lines: list[str] = []
    for table in AICC_TABLES:
        lines.append(f"COPY public.{table} (id) FROM stdin;")
        lines.extend(f"row-{table}-{index}" for index in range(counts[table]))
        lines.append(r"\.")
    return "\n".join(lines) + "\n"


def selftest() -> None:
    old_parts = os.environ.get("EXPECTED_AICC_ROW_COUNT_PARTS")
    old_fingerprint = os.environ.get("EXPECTED_AICC_ROW_COUNT_FINGERPRINT")
    os.environ["EXPECTED_AICC_ROW_COUNT_PARTS"] = "8"
    os.environ["EXPECTED_AICC_ROW_COUNT_FINGERPRINT"] = (
        "b6c67dcf199bba386c2d67c5b0d62624"
    )
    zero_counts = {table: 0 for table in AICC_TABLES}

    try:
        with tempfile.TemporaryDirectory(prefix="l1b-b2-aicc-selftest-") as temp:
            root = pathlib.Path(temp)
            data = root / "data.sql"
            expected = root / "expected.tsv"
            actual = root / "actual.tsv"
            data.write_text(fixture(zero_counts), encoding="utf-8")
            extract_counts(data, expected)
            write_counts(actual, zero_counts)
            verify_frozen(expected)
            compare_counts(expected, actual)

            actual.unlink()
            altered = dict(zero_counts)
            altered["aicc_tasks"] = 1
            write_counts(actual, altered)
            try:
                compare_counts(expected, actual)
            except ValueError:
                pass
            else:
                raise AssertionError("mismatched AICC counts were accepted")

            missing = root / "missing.sql"
            missing.write_text(
                fixture(zero_counts).replace(
                    "COPY public.aicc_tasks (id) FROM stdin;\n\\.\n", "", 1
                ),
                encoding="utf-8",
            )
            try:
                extract_counts(missing, root / "missing.tsv")
            except ValueError:
                pass
            else:
                raise AssertionError("missing AICC COPY section was accepted")

            duplicate = root / "duplicate.sql"
            duplicate.write_text(
                fixture(zero_counts)
                + "COPY public.aicc_tasks (id) FROM stdin;\n\\.\n",
                encoding="utf-8",
            )
            try:
                extract_counts(duplicate, root / "duplicate.tsv")
            except ValueError:
                pass
            else:
                raise AssertionError("duplicate AICC COPY section was accepted")

            unexpected = root / "unexpected.sql"
            unexpected.write_text(
                fixture(zero_counts)
                + "COPY public.aicc_unreviewed (id) FROM stdin;\n\\.\n",
                encoding="utf-8",
            )
            try:
                extract_counts(unexpected, root / "unexpected.tsv")
            except ValueError:
                pass
            else:
                raise AssertionError("unexpected AICC COPY section was accepted")
    finally:
        if old_parts is None:
            os.environ.pop("EXPECTED_AICC_ROW_COUNT_PARTS", None)
        else:
            os.environ["EXPECTED_AICC_ROW_COUNT_PARTS"] = old_parts
        if old_fingerprint is None:
            os.environ.pop("EXPECTED_AICC_ROW_COUNT_FINGERPRINT", None)
        else:
            os.environ["EXPECTED_AICC_ROW_COUNT_FINGERPRINT"] = old_fingerprint


def main() -> int:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    extract = commands.add_parser("extract")
    extract.add_argument("data_sql", type=pathlib.Path)
    extract.add_argument("output", type=pathlib.Path)
    compare = commands.add_parser("compare")
    compare.add_argument("expected", type=pathlib.Path)
    compare.add_argument("actual", type=pathlib.Path)
    verify = commands.add_parser("verify")
    verify.add_argument("counts", type=pathlib.Path)
    commands.add_parser("selftest")
    args = parser.parse_args()

    try:
        if args.command == "extract":
            extract_counts(args.data_sql, args.output)
        elif args.command == "compare":
            compare_counts(args.expected, args.actual)
        elif args.command == "verify":
            verify_frozen(args.counts)
        else:
            selftest()
    except (OSError, UnicodeError, ValueError, AssertionError) as error:
        print(f"L1B B-2 AICC check failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
