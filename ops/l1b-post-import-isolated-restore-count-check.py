#!/usr/bin/env python3
"""Generate fail-closed SQL for exact B-2 restored-count reconciliation.

The input is the fixed aggregate-count TSV extracted from the encrypted B-1
data dump. The generated SQL compares every reviewed relation directly inside
the disposable PostgreSQL target, avoiding a formatter-mediated psql TSV
round-trip. This helper never connects to Production and never reads row data.
"""

from __future__ import annotations

import argparse
import pathlib
import stat
import sys
import tempfile

CORE_RELATIONS = (
    "auth.users",
    "public.mtp_line_accounts",
    "public.mtp_line_events",
    "public.mtp_line_link_codes",
    "public.mtp_line_mutations",
    "public.mtp_line_snapshots",
    "public.mtp_import_batches",
    "public.mtp_import_chunks",
    "public.mtp_import_staging",
    "public.mtp_import_rejects",
    "public.mtp_tasks",
    "public.mtp_subtasks",
    "public.mtp_events",
    "public.mtp_event_windows",
    "public.mtp_task_attachments",
)
CORE_SET = set(CORE_RELATIONS)


def read_counts(path: pathlib.Path) -> dict[str, int]:
    if path.is_symlink() or not path.is_file():
        raise ValueError("aggregate count file is absent or unsafe")
    counts: dict[str, int] = {}
    with path.open("r", encoding="utf-8", errors="strict") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            parts = raw_line.rstrip("\r\n").split("\t")
            if len(parts) != 2 or parts[0] not in CORE_SET:
                raise ValueError(f"invalid aggregate count record at line {line_number}")
            if parts[0] in counts or not parts[1].isdigit():
                raise ValueError(f"invalid aggregate count value at line {line_number}")
            counts[parts[0]] = int(parts[1])
    missing = sorted(CORE_SET - set(counts))
    extra = sorted(set(counts) - CORE_SET)
    if missing or extra:
        raise ValueError(
            "aggregate count file differs from exact relation inventory; "
            f"missing={','.join(missing) or '<none>'}; "
            f"extra={','.join(extra) or '<none>'}"
        )
    return counts


def quote_relation(relation: str) -> str:
    schema, table = relation.split(".", 1)
    if relation not in CORE_SET:
        raise ValueError("unreviewed relation requested")
    return f'"{schema}"."{table}"'


def generate_sql(counts_path: pathlib.Path, output: pathlib.Path) -> None:
    if output.exists() or output.is_symlink():
        raise ValueError("count-verification SQL output already exists or is unsafe")
    counts = read_counts(counts_path)
    lines = [
        r"\set ON_ERROR_STOP on",
        "do $l1b_b2_exact_counts$",
        "begin",
    ]
    for relation in CORE_RELATIONS:
        expected = counts[relation]
        quoted = quote_relation(relation)
        lines.extend(
            [
                f"  if (select count(*)::bigint from {quoted}) <> {expected}::bigint then",
                f"    raise exception 'restored aggregate count mismatch: {relation}';",
                "  end if;",
            ]
        )
    lines.extend(["end;", "$l1b_b2_exact_counts$;", ""])
    output.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    output.chmod(0o600)


def write_fixture(path: pathlib.Path, omitted: str | None = None) -> None:
    with path.open("x", encoding="utf-8", newline="\n") as handle:
        for index, relation in enumerate(CORE_RELATIONS):
            if relation == omitted:
                continue
            handle.write(f"{relation}\t{index}\n")
    path.chmod(0o600)


def selftest() -> None:
    with tempfile.TemporaryDirectory(prefix="l1b-b2-count-check-") as temp:
        root = pathlib.Path(temp)
        counts = root / "counts.tsv"
        sql = root / "counts.sql"
        write_fixture(counts)
        generate_sql(counts, sql)
        payload = sql.read_text(encoding="utf-8")
        if payload.count("restored aggregate count mismatch:") != len(CORE_RELATIONS):
            raise AssertionError("generated SQL does not cover every exact relation")
        for relation in CORE_RELATIONS:
            if payload.count(f"restored aggregate count mismatch: {relation}") != 1:
                raise AssertionError(f"generated SQL coverage differs for {relation}")
        mode = stat.S_IMODE(sql.stat().st_mode)
        if mode != 0o600:
            raise AssertionError("generated SQL mode is not 0600")

        missing = root / "missing.tsv"
        write_fixture(missing, omitted=CORE_RELATIONS[-1])
        try:
            generate_sql(missing, root / "missing.sql")
        except ValueError:
            pass
        else:
            raise AssertionError("missing aggregate relation was accepted")

        duplicate = root / "duplicate.tsv"
        duplicate.write_text(counts.read_text(encoding="utf-8"), encoding="utf-8")
        with duplicate.open("a", encoding="utf-8") as handle:
            handle.write(f"{CORE_RELATIONS[0]}\t0\n")
        duplicate.chmod(0o600)
        try:
            generate_sql(duplicate, root / "duplicate.sql")
        except ValueError:
            pass
        else:
            raise AssertionError("duplicate aggregate relation was accepted")


def main() -> int:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    generate = commands.add_parser("generate-sql")
    generate.add_argument("counts", type=pathlib.Path)
    generate.add_argument("output", type=pathlib.Path)
    commands.add_parser("selftest")
    args = parser.parse_args()
    try:
        if args.command == "generate-sql":
            generate_sql(args.counts, args.output)
        else:
            selftest()
    except (OSError, UnicodeError, ValueError, AssertionError) as error:
        print(f"L1B B-2 exact count check failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
