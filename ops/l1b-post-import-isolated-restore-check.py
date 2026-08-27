#!/usr/bin/env python3
"""Fail-closed helpers for the fresh post-import L1B B-2 restore drill.

The helper validates immutable artifact metadata, safely extracts the encrypted
artifact ZIP, compares aggregate COPY counts without printing row content, and
checks the source/workflow safety contract. It never connects to Production.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import stat
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

TARGET_RELATIONS = (
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

COPY_HEADER = re.compile(
    r'^COPY\s+(?P<relation>(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)'
    r'\.(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*))\s+\('
)
PIN_NAMES = (
    "EXPECTED_BACKUP_RUN_ID",
    "EXPECTED_ARTIFACT_ID",
    "EXPECTED_ARTIFACT_NAME",
    "EXPECTED_ARTIFACT_CREATED_AT",
    "EXPECTED_ARTIFACT_EXPIRES_AT",
    "EXPECTED_ARTIFACT_ZIP_BYTES",
    "EXPECTED_ARTIFACT_ZIP_SHA256",
    "EXPECTED_BACKUP_STAMP",
    "EXPECTED_ARCHIVE_BYTES",
    "EXPECTED_ARCHIVE_SHA256",
    "EXPECTED_ROLES_SHA256",
    "EXPECTED_SCHEMA_SHA256",
    "EXPECTED_DATA_SHA256",
)


def required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ValueError(f"required contract variable is absent: {name}")
    return value


def normalize_relation(value: str) -> str:
    return ".".join(part.strip('"') for part in value.split("."))


def extract_counts(data_sql: Path, output: Path) -> dict[str, int]:
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
            relation = normalize_relation(match.group("relation"))
            if relation not in TARGET_RELATIONS:
                continue
            if relation in counts:
                raise ValueError(f"duplicate COPY section for {relation}")
            counts[relation] = 0
            active = relation
    if active is not None:
        raise ValueError(f"unterminated COPY section for {active}")
    missing = sorted(set(TARGET_RELATIONS) - set(counts))
    if missing:
        raise ValueError("missing required COPY sections: " + ", ".join(missing))
    with output.open("w", encoding="utf-8", newline="\n") as handle:
        for relation in TARGET_RELATIONS:
            handle.write(f"{relation}\t{counts[relation]}\n")
    output.chmod(0o600)
    return counts


def read_counts(path: Path) -> dict[str, int]:
    result: dict[str, int] = {}
    with path.open("r", encoding="utf-8", errors="strict") as handle:
        for number, raw in enumerate(handle, start=1):
            parts = raw.rstrip("\r\n").split("\t")
            if len(parts) != 2 or parts[0] not in TARGET_RELATIONS:
                raise ValueError(f"invalid aggregate count record at line {number}")
            if parts[0] in result or not parts[1].isdigit():
                raise ValueError(f"invalid aggregate count value at line {number}")
            result[parts[0]] = int(parts[1])
    if set(result) != set(TARGET_RELATIONS):
        raise ValueError("aggregate count file does not contain the exact relation set")
    return result


def compare_counts(expected: Path, actual: Path) -> None:
    left = read_counts(expected)
    right = read_counts(actual)
    mismatches = [name for name in TARGET_RELATIONS if left[name] != right[name]]
    if mismatches:
        raise ValueError("restored row-count mismatch: " + ", ".join(mismatches))


def validate_metadata(path: Path) -> None:
    with path.open("r", encoding="utf-8", errors="strict") as handle:
        payload = json.load(handle)
    workflow_run = payload.get("workflow_run")
    if not isinstance(workflow_run, dict):
        raise ValueError("artifact metadata lacks workflow-run identity")
    expected = {
        "id": int(required_env("EXPECTED_ARTIFACT_ID")),
        "name": required_env("EXPECTED_ARTIFACT_NAME"),
        "size_in_bytes": int(required_env("EXPECTED_ARTIFACT_ZIP_BYTES")),
        "digest": "sha256:" + required_env("EXPECTED_ARTIFACT_ZIP_SHA256"),
        "created_at": required_env("EXPECTED_ARTIFACT_CREATED_AT"),
        "expires_at": required_env("EXPECTED_ARTIFACT_EXPIRES_AT"),
        "expired": False,
    }
    for key, value in expected.items():
        if payload.get(key) != value:
            raise ValueError(f"artifact metadata mismatch: {key}")
    run_expected = {
        "id": int(required_env("EXPECTED_BACKUP_RUN_ID")),
        "repository_id": int(required_env("EXPECTED_REPOSITORY_ID")),
        "head_repository_id": int(required_env("EXPECTED_REPOSITORY_ID")),
        "head_branch": required_env("EXPECTED_BACKUP_HEAD_REF"),
        "head_sha": required_env("EXPECTED_SOURCE_SHA"),
    }
    for key, value in run_expected.items():
        if workflow_run.get(key) != value:
            raise ValueError(f"artifact workflow metadata mismatch: {key}")
    expires = datetime.fromisoformat(expected["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) >= expires:
        raise ValueError("the pinned B-1 artifact has expired")


def extract_artifact(archive: Path, destination: Path) -> None:
    stamp = required_env("EXPECTED_BACKUP_STAMP")
    encrypted_name = f"dashboard-l1b-post-import-backup-{stamp}.tar.gz.gpg"
    manifest_name = f"dashboard-l1b-post-import-backup-{stamp}.manifest.txt"
    expected_names = {encrypted_name, manifest_name}
    expected_archive_size = int(required_env("EXPECTED_ARCHIVE_BYTES"))
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    if any(destination.iterdir()):
        raise ValueError("artifact extraction destination is not empty")
    with zipfile.ZipFile(archive, "r") as bundle:
        members = bundle.infolist()
        if len(members) != 2 or {member.filename for member in members} != expected_names:
            raise ValueError("artifact ZIP does not contain the exact two-file contract")
        for member in members:
            name = member.filename
            path = Path(name)
            mode = member.external_attr >> 16
            if (
                member.is_dir()
                or path.is_absolute()
                or len(path.parts) != 1
                or "/" in name
                or "\\" in name
                or name in {".", ".."}
                or (mode and not stat.S_ISREG(mode))
            ):
                raise ValueError("artifact ZIP contains an unsafe member")
            if name == encrypted_name and member.file_size != expected_archive_size:
                raise ValueError("encrypted archive member size differs")
            if name == manifest_name and not 1 <= member.file_size <= 8192:
                raise ValueError("external manifest size is outside safe bounds")
            target = destination / name
            with bundle.open(member, "r") as source, target.open("xb") as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)
            target.chmod(0o600)


def parse_workflow_env(payload: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in payload.splitlines():
        match = re.match(r"^  ([A-Z][A-Z0-9_]+):\s*['\"]?([^'\"]+)['\"]?\s*$", line)
        if match:
            result[match.group(1)] = match.group(2).strip()
    return result


def check_contract(workflow: Path, restore_script: Path) -> None:
    wf = workflow.read_text(encoding="utf-8")
    script = restore_script.read_text(encoding="utf-8")
    required_workflow = (
        "types: [opened, synchronize, reopened, labeled]",
        "branches: [main]",
        "environment: production-backup",
        "owner-approved-b2-restore",
        "EXPECTED_BASE_SHA: 297854c09205097a6a58cbce4c64961c802cd7a3",
        "EXPECTED_HEAD_REF: ops/l1b-post-import-isolated-restore",
        "EXPECTED_PROJECT_REF: qjaywadzvwvcspdsjxth",
        "EXPECTED_SOURCE_SHA: c8514e0619ccc13c48c96a6e9e7d334aded5ce11",
        "EXPECTED_DB_IMAGE: supabase/postgres@sha256:ca7871b587ca2c401ac0f325df6249c9aa0d25647ded34631158efc51176767f",
        "BACKUP_PASSPHRASE: ${{ secrets.BACKUP_PASSPHRASE }}",
        "actions: read",
        "contents: read",
        "L1B fresh post-import B-2 isolated restore: PASS",
        "steps.restore.outcome",
    )
    for token in required_workflow:
        if token not in wf:
            raise ValueError("workflow is missing a required safety token")
    forbidden_workflow = (
        r"^\s*pull_request_target\s*:",
        r"^\s*workflow_dispatch\s*:",
        r"^\s*push\s*:",
        r"actions/upload-artifact",
        r"secrets\.(?:SUPABASE|DATABASE|POSTGRES|DB)_?[A-Z0-9_]*",
        r"SUPABASE_DB_URL\s*:",
        r"DATABASE_URL\s*:",
    )
    if any(re.search(pattern, wf, re.MULTILINE) for pattern in forbidden_workflow):
        raise ValueError("workflow contains a forbidden safety pattern")
    secrets = set(re.findall(r"\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*}}", wf))
    if secrets != {"BACKUP_PASSPHRASE"}:
        raise ValueError("workflow references an unapproved Environment secret set")
    action_refs = re.findall(r"^\s*uses:\s*[^@\s]+@([^\s#]+)", wf, re.MULTILINE)
    if not action_refs or any(re.fullmatch(r"[0-9a-f]{40}", ref) is None for ref in action_refs):
        raise ValueError("every GitHub Action must use an immutable commit SHA")
    env = parse_workflow_env(wf)
    pending = env.get("EXPECTED_ARTIFACT_ID") == "PENDING_B1"
    if pending:
        if any(env.get(name) != "PENDING_B1" for name in PIN_NAMES):
            raise ValueError("B-1 template pins are only partially pending")
        if "'PENDING_B1' != 'PENDING_B1'" not in wf:
            raise ValueError("pending B-1 template is not hard-disabled")
    else:
        if any(not env.get(name) or env.get(name) == "PENDING_B1" for name in PIN_NAMES):
            raise ValueError("B-1 execution pins are incomplete")
        expected_gate = f"'{env['EXPECTED_ARTIFACT_ID']}' != 'PENDING_B1'"
        if expected_gate not in wf:
            raise ValueError("B-2 execution gate is not bound to the exact artifact ID")

    required_script = (
        "--network none",
        "--single-transaction",
        "sha256sum -c SHA256SUMS.txt",
        "EXPECTED_LINE_FINGERPRINT",
        "EXPECTED_L0B_FINGERPRINT",
        "EXPECTED_AICC_FINGERPRINT",
        "L1B_B2_CHILD_RESTORE_COMPLETE",
    )
    for token in required_script:
        if token not in script:
            raise ValueError("restore script is missing a required safety token")
    final_marker = "L1B fresh post-import B-2 isolated restore: PASS"
    if wf.count(final_marker) != 1:
        raise ValueError("workflow must contain exactly one final recovery PASS marker")
    if final_marker in script:
        raise ValueError("child restore emits final recovery PASS before workflow cleanup")
    if wf.index("steps.restore.outcome") > wf.index(final_marker):
        raise ValueError("final recovery PASS is not gated by successful restore outcome")
    forbidden_script = (
        r"\.supabase\.co",
        r"pooler\.supabase",
        r"https?://",
        r"\bcurl\b",
        r"\bwget\b",
        r"\bset\s+-x\b",
        r"supabase\s+db\s+push",
        r"docker\s+system\s+(?:prune|rm)",
        r"--network\s+(?:host|bridge)",
        r"^\s*(?:-p|--publish)(?:\s|=)",
        r"actions/upload-artifact",
        r"SUPABASE_DB_URL",
        r"DATABASE_URL",
    )
    if any(re.search(pattern, script, re.MULTILINE) for pattern in forbidden_script):
        raise ValueError("restore script contains a forbidden safety pattern")


def selftest() -> None:
    fixture_lines: list[str] = []
    for index, relation in enumerate(TARGET_RELATIONS):
        fixture_lines.append(f"COPY {relation} (id) FROM stdin;")
        fixture_lines.extend([f"row-{index}-{n}" for n in range(index % 3)])
        fixture_lines.append(r"\.")
    fixture = "\n".join(fixture_lines) + "\n"
    with tempfile.TemporaryDirectory(prefix="l1b-b2-selftest-") as temp:
        root = Path(temp)
        source = root / "data.sql"
        expected = root / "expected.tsv"
        actual = root / "actual.tsv"
        source.write_text(fixture, encoding="utf-8")
        counts = extract_counts(source, expected)
        if set(counts) != set(TARGET_RELATIONS):
            raise AssertionError("selftest did not extract the exact relation set")
        actual.write_text(expected.read_text(encoding="utf-8"), encoding="utf-8")
        compare_counts(expected, actual)
        first = TARGET_RELATIONS[0]
        actual.write_text(
            actual.read_text(encoding="utf-8").replace(f"{first}\t0", f"{first}\t9", 1),
            encoding="utf-8",
        )
        try:
            compare_counts(expected, actual)
        except ValueError:
            pass
        else:
            raise AssertionError("selftest accepted mismatched counts")


def main() -> int:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    extract = commands.add_parser("extract")
    extract.add_argument("data_sql", type=Path)
    extract.add_argument("output", type=Path)
    compare = commands.add_parser("compare")
    compare.add_argument("expected", type=Path)
    compare.add_argument("actual", type=Path)
    metadata = commands.add_parser("metadata")
    metadata.add_argument("metadata_json", type=Path)
    artifact = commands.add_parser("artifact")
    artifact.add_argument("archive", type=Path)
    artifact.add_argument("destination", type=Path)
    contract = commands.add_parser("contract")
    contract.add_argument("workflow", type=Path)
    contract.add_argument("restore_script", type=Path)
    commands.add_parser("selftest")
    args = parser.parse_args()
    try:
        if args.command == "extract":
            extract_counts(args.data_sql, args.output)
        elif args.command == "compare":
            compare_counts(args.expected, args.actual)
        elif args.command == "metadata":
            validate_metadata(args.metadata_json)
        elif args.command == "artifact":
            extract_artifact(args.archive, args.destination)
        elif args.command == "contract":
            check_contract(args.workflow, args.restore_script)
        else:
            selftest()
    except (OSError, ValueError, AssertionError, json.JSONDecodeError, zipfile.BadZipFile) as error:
        print(f"L1B B-2 check failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
