#!/usr/bin/env python3
"""Fail-closed, non-sensitive checks for the one-time Packet A restore drill.

The helper handles immutable artifact metadata, safe ZIP extraction, exact COPY
row counts, and the static source contract. It never prints restored row data.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
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
)

RESTORE_PHASES = ("roles", "schema", "data")
RESTORE_PHASE_MARKER = re.compile(
    rb"^PACKET_A_B2_PHASE=([0-9a-f]{32}):(roles|schema|data)$"
)
RESTORE_SQLSTATE_ERROR = re.compile(
    rb"^(?:psql:(?P<source>/packet-a-restore/(?:roles|schema|data)\.sql):"
    rb"(?P<line>[1-9][0-9]{0,9}):\s+)?ERROR:\s+(?P<sqlstate>[0-9A-Z]{5})$"
)
RESTORE_SQLSTATE_NONERROR = re.compile(
    rb"^(?:psql:(?P<source>/packet-a-restore/(?:roles|schema|data)\.sql):"
    rb"(?P<line>[1-9][0-9]{0,9}):\s+)?"
    rb"(?:NOTICE|WARNING|INFO):\s+(?P<sqlstate>[0-9A-Z]{5})$"
)
MAX_RESTORE_LOG_BYTES = 8 * 1024 * 1024
MAX_RESTORE_LOG_LINE_BYTES = 4096

# Exact PostgreSQL error SQLSTATEs from REL_17_STABLE errcodes.txt blob
# 3250d539e1c467af6431283baf7ee1fa2704f55a. Success and warning codes are
# deliberately absent, so a custom five-character value cannot become output.
APPROVED_POSTGRESQL_17_ERROR_SQLSTATES = frozenset(
    """
    03000 08000 08003 08006 08001 08004 08007 08P01 09000 0A000 0B000
    0F000 0F001 0L000 0LP01 0P000 0Z000 0Z002 20000 21000 22000 2202E
    22021 22008 22012 22005 2200B 22022 22015 2201E 22014 22016 2201F
    2201G 22018 22007 22019 2200D 22025 22P06 22010 22023 22013 2201B
    2201W 2201X 2202H 2202G 22009 2200C 2200G 22004 22002 22003 2200H
    22026 22001 22011 22027 22024 2200F 22P01 22P02 22P03 22P04 22P05
    2200L 2200M 2200N 2200S 2200T 22030 22031 22032 22033 22034 22035
    22036 22037 22038 22039 2203A 2203B 2203C 2203D 2203E 2203F 2203G
    23000 23001 23502 23503 23505 23514 23P01 24000 25000 25001 25002
    25008 25003 25004 25005 25006 25007 25P01 25P02 25P03 25P04 26000
    27000 28000 28P01 2B000 2BP01 2D000 2F000 2F005 2F002 2F003 2F004
    34000 38000 38001 38002 38003 38004 39000 39001 39004 39P01 39P02
    39P03 3B000 3B001 3D000 3F000 40000 40002 40001 40003 40P01 42000
    42601 42501 42846 42803 42P20 42P19 42830 42602 42622 42939 42804
    42P18 42P21 42P22 42809 428C9 42703 42883 42P01 42P02 42704 42701
    42P03 42P04 42723 42P05 42P06 42P07 42712 42710 42702 42725 42P08
    42P09 42P10 42611 42P11 42P12 42P13 42P14 42P15 42P16 42P17 44000
    53000 53100 53200 53300 53400 54000 54001 54011 54023 55000 55006
    55P02 55P03 55P04 57000 57014 57P01 57P02 57P03 57P04 57P05 58000
    58030 58P01 58P02 F0000 F0001 HV000 HV005 HV002 HV010 HV021 HV024
    HV007 HV008 HV004 HV006 HV091 HV00B HV00C HV00D HV090 HV00A HV009
    HV014 HV001 HV00P HV00J HV00K HV00Q HV00R HV00L HV00M HV00N P0000
    P0001 P0002 P0003 P0004 XX000 XX001 XX002
    """.split()
)
APPROVED_POSTGRESQL_17_NONERROR_SQLSTATES = frozenset(
    "00000 01000 0100C 01008 01003 01007 01006 01004 01P01 02000 02001".split()
)

RESTORE_LOG_PATH_CONTRACT = (
    'RESTORE_LOG="$WORK_DIR/restore.log"\n'
    'RESTORE_ERROR_LOG="$WORK_DIR/restore-error.log"\n'
)
RESTORE_NONCE_CONTRACT = (
    "PHASE_NONCE=''\n"
    "if ! PHASE_NONCE=\"$(python3 -c 'import secrets; "
    "print(secrets.token_hex(16))')\" \\\n"
    '   || [[ ! "$PHASE_NONCE" =~ ^[0-9a-f]{32}$ ]]; then\n'
    '  echo "::error::Unable to create the private restore phase boundary"\n'
    "  exit 1\n"
    "fi\n\n"
    "unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD\n"
)
RESTORE_COMMAND_START = (
    'if ! docker exec --env PGPASSWORD="$LOCAL_DB_PASSWORD" '
    '"$ISOLATED_DB_CONTAINER" \\\n'
    '  psql \\\n'
)
RESTORE_CONNECTION_CONTRACT = (
    '  -h /var/run/postgresql \\\n'
    '  -U "$LOCAL_DB_ADMIN" \\\n'
    '  -d postgres \\\n'
    '  -X \\\n'
)
RESTORE_EXECUTION_TAIL = (
    '  --single-transaction \\\n'
    '  --set=ON_ERROR_STOP=1 \\\n'
    '  --set=VERBOSITY=sqlstate \\\n'
    '  --command "\\\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:roles" \\\n'
    '  --file /packet-a-restore/roles.sql \\\n'
    '  --command "\\\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:schema" \\\n'
    '  --file /packet-a-restore/schema.sql \\\n'
    '  --command "\\\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:data" \\\n'
    "  --command 'SET session_replication_role = replica;' \\\n"
    '  --file /packet-a-restore/data.sql \\\n'
    '  >"$RESTORE_LOG" 2>"$RESTORE_ERROR_LOG"; then'
)
RESTORE_EXECUTION_CONTRACT = (
    RESTORE_COMMAND_START + RESTORE_CONNECTION_CONTRACT + RESTORE_EXECUTION_TAIL
)
RESTORE_FAILURE_CONTRACT = (
    "\n  restore_classification=''\n"
    '  if restore_classification="$(\n'
    '    python3 "$CHECKER" classify-restore "$RESTORE_ERROR_LOG" '
    '"$PHASE_NONCE" 2>>"$RESTORE_ERROR_LOG"\n'
    '  )" && [[ "$restore_classification" =~ '
    '^phase=(roles|schema|data)[[:space:]]sqlstate=[0-9A-Z]{5}$ ]]; then\n'
    '    echo "::error::Isolated logical restore failed '
    '($restore_classification); raw diagnostics were withheld and deleted"\n'
    '  else\n'
    '    echo "::error::Isolated logical restore failed '
    '(phase=unknown sqlstate=unknown); raw diagnostics were withheld and deleted"\n'
    '  fi\n'
    '  exit 1'
)

STORAGE_COMPATIBILITY_START = (
    "# CLI 2.111.0 bootstraps Storage through upstream migration 60"
)
STORAGE_COMPATIBILITY_END = (
    "# Plaintext exists only after the target has no network and no published port."
)
STORAGE_COMPATIBILITY_BLOCK_SHA256 = (
    "1d85af0d8fb9f7216b68baaaa0280eb4c11bae1cc0e2e0c277e44a49d176eaa2"
)

COPY_HEADER = re.compile(
    r'^COPY\s+(?P<relation>(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)'
    r'\.(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*))\s+\('
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
            if not match:
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


def read_count_file(path: Path) -> dict[str, int]:
    result: dict[str, int] = {}
    with path.open("r", encoding="utf-8", errors="strict") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.rstrip("\r\n")
            parts = line.split("\t")
            if len(parts) != 2 or parts[0] not in TARGET_RELATIONS:
                raise ValueError(f"invalid aggregate count record at line {line_number}")
            if parts[0] in result or not parts[1].isdigit():
                raise ValueError(f"invalid aggregate count value at line {line_number}")
            result[parts[0]] = int(parts[1])
    if set(result) != set(TARGET_RELATIONS):
        raise ValueError("aggregate count file does not contain the exact relation set")
    return result


def compare_counts(expected_path: Path, actual_path: Path) -> None:
    expected = read_count_file(expected_path)
    actual = read_count_file(actual_path)
    mismatches = [
        relation
        for relation in TARGET_RELATIONS
        if expected[relation] != actual[relation]
    ]
    if mismatches:
        raise ValueError("restored row-count mismatch: " + ", ".join(mismatches))


def classify_restore_failure(path: Path, expected_nonce: str) -> tuple[str, str]:
    """Return only a nonce-bound phase and approved PostgreSQL 17 SQLSTATE."""
    if re.fullmatch(r"[0-9a-f]{32}", expected_nonce) is None:
        raise ValueError("restore phase nonce does not satisfy the exact contract")
    if path.is_symlink() or not path.is_file():
        raise ValueError("restore error log is not a regular file")
    if path.stat().st_size > MAX_RESTORE_LOG_BYTES:
        raise ValueError("restore error log exceeds the diagnostic size bound")

    phases: list[str] = []
    sqlstates: list[str] = []
    expected_nonce_bytes = expected_nonce.encode("ascii")
    with path.open("rb") as handle:
        for raw_line in handle:
            if len(raw_line) > MAX_RESTORE_LOG_LINE_BYTES:
                raise ValueError("restore error log contains an oversized line")
            line = raw_line.rstrip(b"\r\n")

            if line.startswith(b"PACKET_A_B2_PHASE="):
                match = RESTORE_PHASE_MARKER.fullmatch(line)
                if match is None or sqlstates:
                    raise ValueError("restore error log contains an invalid phase sequence")
                if not hmac.compare_digest(match.group(1), expected_nonce_bytes):
                    raise ValueError("restore error log contains a nonce-mismatched phase")
                phase = match.group(2).decode("ascii")
                if len(phases) >= len(RESTORE_PHASES):
                    raise ValueError("restore error log contains too many phase markers")
                if phase != RESTORE_PHASES[len(phases)]:
                    raise ValueError("restore error log contains an out-of-order phase marker")
                phases.append(phase)
                continue

            match = RESTORE_SQLSTATE_ERROR.fullmatch(line)
            if match is not None:
                if not phases:
                    raise ValueError("restore SQLSTATE appeared before a nonce-bound phase")
                sqlstate = match.group("sqlstate").decode("ascii")
                if sqlstate not in APPROVED_POSTGRESQL_17_ERROR_SQLSTATES:
                    raise ValueError("restore SQLSTATE is outside the PostgreSQL 17 allowlist")
                source = match.group("source")
                if source is None:
                    if phases[-1] != "data":
                        raise ValueError("bare restore SQLSTATE is outside its approved action")
                else:
                    expected_source = f"/packet-a-restore/{phases[-1]}.sql".encode()
                    if not hmac.compare_digest(source, expected_source):
                        raise ValueError("restore SQLSTATE source does not match its phase")
                sqlstates.append(sqlstate)
                continue

            match = RESTORE_SQLSTATE_NONERROR.fullmatch(line)
            if match is not None:
                if not phases:
                    raise ValueError(
                        "restore non-error diagnostic appeared before a nonce-bound phase"
                    )
                sqlstate = match.group("sqlstate").decode("ascii")
                if sqlstate not in APPROVED_POSTGRESQL_17_NONERROR_SQLSTATES:
                    raise ValueError(
                        "restore non-error diagnostic is outside the PostgreSQL 17 allowlist"
                    )
                source = match.group("source")
                if source is None:
                    if phases[-1] != "data":
                        raise ValueError(
                            "bare restore non-error diagnostic is outside its approved action"
                        )
                else:
                    expected_source = f"/packet-a-restore/{phases[-1]}.sql".encode()
                    if not hmac.compare_digest(source, expected_source):
                        raise ValueError(
                            "restore non-error diagnostic source does not match its phase"
                        )
                continue

            if line:
                raise ValueError("restore error log contains an unclassified diagnostic")

    if not phases or len(sqlstates) != 1:
        raise ValueError("restore error log lacks one unambiguous safe classification")
    return phases[-1], sqlstates[0]


def validate_metadata(path: Path) -> None:
    with path.open("r", encoding="utf-8", errors="strict") as handle:
        payload = json.load(handle)

    workflow_run = payload.get("workflow_run")
    if not isinstance(workflow_run, dict):
        raise ValueError("artifact metadata lacks its workflow-run identity")

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

    expected_run = {
        "id": int(required_env("EXPECTED_BACKUP_RUN_ID")),
        "repository_id": int(required_env("EXPECTED_REPOSITORY_ID")),
        "head_repository_id": int(required_env("EXPECTED_REPOSITORY_ID")),
        "head_branch": required_env("EXPECTED_BACKUP_HEAD_REF"),
        "head_sha": required_env("EXPECTED_SOURCE_SHA"),
    }
    for key, value in expected_run.items():
        if workflow_run.get(key) != value:
            raise ValueError(f"artifact workflow metadata mismatch: {key}")

    expiry = datetime.fromisoformat(expected["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) >= expiry:
        raise ValueError("the approved backup artifact has expired")


def extract_artifact(archive: Path, destination: Path) -> None:
    stamp = required_env("EXPECTED_BACKUP_STAMP")
    encrypted_name = f"dashboard-supabase-backup-{stamp}.tar.gz.gpg"
    manifest_name = f"dashboard-supabase-backup-{stamp}.manifest.txt"
    expected_names = {encrypted_name, manifest_name}
    expected_archive_size = int(required_env("EXPECTED_ARCHIVE_BYTES"))

    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    if any(destination.iterdir()):
        raise ValueError("artifact extraction destination is not empty")

    with zipfile.ZipFile(archive, "r") as bundle:
        members = bundle.infolist()
        names = [member.filename for member in members]
        if len(names) != 2 or set(names) != expected_names:
            raise ValueError("artifact ZIP does not contain the exact two-file contract")

        for member in members:
            name = member.filename
            path = Path(name)
            mode = member.external_attr >> 16
            if (
                member.is_dir()
                or path.is_absolute()
                or len(path.parts) != 1
                or name in {".", ".."}
                or "/" in name
                or "\\" in name
                or (mode and not stat.S_ISREG(mode))
            ):
                raise ValueError("artifact ZIP contains an unsafe member")
            if name == encrypted_name and member.file_size != expected_archive_size:
                raise ValueError("encrypted archive member size is not exact")
            if name == manifest_name and not 1 <= member.file_size <= 8192:
                raise ValueError("external manifest size is outside its safe bound")

            target = destination / name
            with bundle.open(member, "r") as source, target.open("xb") as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)
            target.chmod(0o600)


def require_tokens(path: Path, tokens: tuple[str, ...]) -> None:
    payload = path.read_text(encoding="utf-8")
    missing = [token for token in tokens if token not in payload]
    if missing:
        raise ValueError(f"{path.name} is missing required safety tokens")


def forbid_patterns(path: Path, patterns: tuple[str, ...]) -> None:
    payload = path.read_text(encoding="utf-8")
    found = [pattern for pattern in patterns if re.search(pattern, payload, re.MULTILINE)]
    if found:
        raise ValueError(f"{path.name} contains a forbidden safety pattern")


def check_restore_command_contract(payload: str) -> None:
    if payload.count(RESTORE_LOG_PATH_CONTRACT) != 1:
        raise ValueError("restore script lacks one exact private-log declaration")
    if payload.count(RESTORE_NONCE_CONTRACT) != 1:
        raise ValueError("restore script lacks one exact private nonce prelude")
    if payload.count(RESTORE_COMMAND_START) != 1:
        raise ValueError("restore script lacks one exact isolated restore invocation")

    start = payload.index(RESTORE_COMMAND_START)
    nonce_start = payload.index(RESTORE_NONCE_CONTRACT)
    if nonce_start + len(RESTORE_NONCE_CONTRACT) != start:
        raise ValueError("restore nonce is not fresh at the isolated invocation")
    command_end_token = '  >"$RESTORE_LOG" 2>"$RESTORE_ERROR_LOG"; then'
    command_end = payload.find(command_end_token, start)
    if command_end < 0:
        raise ValueError("restore invocation lacks its private-log boundary")
    command_end += len(command_end_token)
    command_block = payload[start:command_end]

    if not hmac.compare_digest(command_block, RESTORE_EXECUTION_CONTRACT):
        raise ValueError("restore invocation does not match the exact atomic phase contract")
    if command_block.count("--single-transaction") != 1:
        raise ValueError("restore invocation must contain one transaction wrapper")

    set_assignments = re.findall(
        r"(?:--(?:set|variable)(?:=|\s+)|-v(?:=|\s+))"
        r"([A-Za-z_][A-Za-z0-9_]*)=([^\s\\]+)",
        command_block,
    )
    if set_assignments != [
        ("ON_ERROR_STOP", "1"),
        ("VERBOSITY", "sqlstate"),
    ]:
        raise ValueError("restore invocation has an unsafe psql variable contract")

    if command_block.count("--command ") != 4:
        raise ValueError("restore invocation has an unsafe command count")

    files = re.findall(r"--file\s+([^\s\\]+)", command_block)
    if files != [
        "/packet-a-restore/roles.sql",
        "/packet-a-restore/schema.sql",
        "/packet-a-restore/data.sql",
    ]:
        raise ValueError("restore invocation has an unsafe SQL file order")

    failure_end = payload.find("\nfi\n", command_end)
    if failure_end < 0:
        raise ValueError("restore invocation lacks a closed failure branch")
    failure_block = payload[command_end:failure_end]
    if not hmac.compare_digest(failure_block, RESTORE_FAILURE_CONTRACT):
        raise ValueError("restore failure branch lacks the exact safe classifier contract")

    private_log_reference = re.compile(
        r"\$(?:RESTORE_(?:ERROR_)?LOG|\{RESTORE_(?:ERROR_)?LOG\})"
    )
    private_log_lines = tuple(
        line
        for line in payload.splitlines()
        if private_log_reference.search(line) is not None
    )
    if private_log_lines != (
        '  >"$RESTORE_LOG" 2>"$RESTORE_ERROR_LOG"; then',
        '    python3 "$CHECKER" classify-restore "$RESTORE_ERROR_LOG" '
        '"$PHASE_NONCE" 2>>"$RESTORE_ERROR_LOG"',
    ):
        raise ValueError("restore private logs have an unsafe reference")

    private_log_path_lines = tuple(
        line
        for line in payload.splitlines()
        if "restore.log" in line or "restore-error.log" in line
    )
    if private_log_path_lines != (
        'RESTORE_LOG="$WORK_DIR/restore.log"',
        'RESTORE_ERROR_LOG="$WORK_DIR/restore-error.log"',
    ):
        raise ValueError("restore private log paths have an unsafe reference")


def check_storage_compatibility_contract(payload: str) -> None:
    if payload.count(STORAGE_COMPATIBILITY_START) != 1:
        raise ValueError("restore script lacks one exact Storage compatibility bridge")
    if payload.count(STORAGE_COMPATIBILITY_END) != 1:
        raise ValueError("restore script lacks one exact plaintext boundary")

    start = payload.index(STORAGE_COMPATIBILITY_START)
    end = payload.index(STORAGE_COMPATIBILITY_END)
    if start >= end:
        raise ValueError("Storage compatibility bridge is outside the plaintext boundary")
    if payload.index("--network none") >= start:
        raise ValueError("Storage compatibility bridge runs before network isolation")

    bridge = payload[start:end]
    bridge_digest = hashlib.sha256(bridge.encode("utf-8")).hexdigest()
    if not hmac.compare_digest(bridge_digest, STORAGE_COMPATIBILITY_BLOCK_SHA256):
        raise ValueError("Storage compatibility bridge differs from the reviewed contract")

    if re.search(
        r"\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)"
        r"\s+storage\.migrations\b",
        bridge,
        re.IGNORECASE,
    ):
        raise ValueError("Storage compatibility bridge mutates the service ledger")


def check_contract(workflow: Path, restore_script: Path) -> None:
    workflow_payload = workflow.read_text(encoding="utf-8")
    restore_script_payload = restore_script.read_text(encoding="utf-8")
    require_tokens(
        workflow,
        (
            "ops/packet-a-isolated-restore-test",
            "owner-approved-b2-restore",
            "environment: production-backup",
            "EXPECTED_BACKUP_RUN_ID: '32149051510'",
            "EXPECTED_ARTIFACT_ID: '9452687931'",
            "EXPECTED_ARTIFACT_NAME: dashboard-supabase-backup-20260821T153930Z",
            "EXPECTED_ARTIFACT_ZIP_SHA256: 8e4ab3857f546e027df7b5ee7867e27070798fac3f77a292bbc8c92bef9812d8",
            "EXPECTED_ARCHIVE_SHA256: 1f74262d1b341ed919b0a8f8fe29ffb852946cd5d6ab1700f13e97ede97c91e4",
            "EXPECTED_DB_IMAGE: supabase/postgres@sha256:ca7871b587ca2c401ac0f325df6249c9aa0d25647ded34631158efc51176767f",
            "EXPECTED_STORAGE_BASELINE_MAX_MIGRATION: '60'",
            "EXPECTED_STORAGE_COMPAT_TARGET_MIGRATION: '62'",
            "EXPECTED_STORAGE_MIGRATION_61_BLOB_SHA: 473f19ac94419f9cd3f25f2e40c97cefafb2798d",
            "EXPECTED_STORAGE_MIGRATION_62_BLOB_SHA: 76cf3f7f0f26d37d257c32ebb90f5beeb5a32a1e",
            "BACKUP_PASSPHRASE: ${{ secrets.BACKUP_PASSPHRASE }}",
            "BACKUP_PASSPHRASE_FILE: ${{ runner.temp }}/packet-a-b2-passphrase",
            "GH_TOKEN: ${{ github.token }}",
            "actions: read",
            "contents: read",
            "packet-a-one-time-isolated-restore-check.py metadata",
            "packet-a-one-time-isolated-restore-check.py artifact",
        ),
    )
    forbid_patterns(
        workflow,
        (
            r"^\s*pull_request_target\s*:",
            r"^\s*workflow_dispatch\s*:",
            r"^\s*push\s*:",
            r"secrets\.(?:SUPABASE|DATABASE|POSTGRES|DB)_?[A-Z0-9_]*",
            r"SUPABASE_DB_URL\s*:",
            r"DATABASE_URL\s*:",
            r"actions/upload-artifact",
            r"actions/download-artifact",
        ),
    )

    secret_refs = set(
        re.findall(r"\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*}}", workflow_payload)
    )
    if secret_refs != {"BACKUP_PASSPHRASE"}:
        raise ValueError("workflow references an unapproved Environment secret set")

    action_refs = re.findall(r"^\s*uses:\s*[^@\s]+@([^\s#]+)", workflow_payload, re.MULTILINE)
    if not action_refs or any(not re.fullmatch(r"[0-9a-f]{40}", ref) for ref in action_refs):
        raise ValueError("every GitHub Action must use an immutable commit SHA")

    require_tokens(
        restore_script,
        (
            "supabase/postgres@sha256:ca7871b587ca2c401ac0f325df6249c9aa0d25647ded34631158efc51176767f",
            "--network none",
            "--single-transaction",
            "--set=VERBOSITY=sqlstate",
            "\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:roles",
            "\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:schema",
            "\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:data",
            "secrets.token_hex(16)",
            'RESTORE_ERROR_LOG="$WORK_DIR/restore-error.log"',
            'python3 "$CHECKER" classify-restore "$RESTORE_ERROR_LOG" "$PHASE_NONCE"',
            "SET session_replication_role = replica",
            "supabase stop --no-backup",
            "sha256sum -c SHA256SUMS.txt",
            "mtp_import_batches",
            "mtp_claim_line_link(text,text)",
            "owners read their LINE snapshot",
            "mtp_line_mutations_source_event_uidx",
            "owner orphan",
            "Storage compatibility bridge changed the service ledger",
        ),
    )
    forbid_patterns(
        restore_script,
        (
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
            r"--set=VERBOSITY=terse",
            r"\b(?:cat|head|tail|less|more|tee)\b[^\n]*"
            r"\$RESTORE_(?:ERROR_)?LOG",
        ),
    )
    check_storage_compatibility_contract(restore_script_payload)
    check_restore_command_contract(restore_script_payload)


def selftest() -> None:
    fixture = """\
COPY auth.users (id) FROM stdin;
auth-one
\\.
COPY public.mtp_line_accounts (id) FROM stdin;
one
two
\\.
COPY public.mtp_line_events (id) FROM stdin;
\\.
COPY public.mtp_line_link_codes (id) FROM stdin;
one
\\.
COPY public.mtp_line_mutations (id) FROM stdin;
one
\\.
COPY public.mtp_line_snapshots (id) FROM stdin;
one
\\.
"""
    with tempfile.TemporaryDirectory(prefix="packet-a-b2-selftest-") as tmp:
        root = Path(tmp)
        source = root / "data.sql"
        expected = root / "expected.tsv"
        actual = root / "actual.tsv"
        source.write_text(fixture, encoding="utf-8")
        counts = extract_counts(source, expected)
        if counts["public.mtp_line_accounts"] != 2:
            raise AssertionError("fixture count was not extracted")
        actual.write_text(expected.read_text(encoding="utf-8"), encoding="utf-8")
        compare_counts(expected, actual)
        actual.write_text(
            actual.read_text(encoding="utf-8").replace(
                "public.mtp_line_accounts\t2", "public.mtp_line_accounts\t3"
            ),
            encoding="utf-8",
        )
        try:
            compare_counts(expected, actual)
        except ValueError:
            pass
        else:
            raise AssertionError("mismatched counts were accepted")

        restore_log = root / "restore-error.log"
        phase_nonce = "0123456789abcdef0123456789abcdef"
        phase_prefix = f"PACKET_A_B2_PHASE={phase_nonce}:".encode("ascii")
        if (
            len(APPROVED_POSTGRESQL_17_ERROR_SQLSTATES) != 249
            or len(APPROVED_POSTGRESQL_17_NONERROR_SQLSTATES) != 11
        ):
            raise AssertionError("PostgreSQL 17 SQLSTATE allowlists changed")
        restore_log.write_bytes(
            phase_prefix + b"roles\n"
            + b"psql:/packet-a-restore/roles.sql:1: NOTICE:  00000\n"
            + phase_prefix + b"schema\n"
            b"psql:/packet-a-restore/schema.sql:42: ERROR:  42P07\n"
        )
        if classify_restore_failure(restore_log, phase_nonce) != ("schema", "42P07"):
            raise AssertionError("safe restore failure was classified incorrectly")

        restore_log.write_bytes(
            phase_prefix + b"roles\n"
            + phase_prefix + b"schema\n"
            + phase_prefix + b"data\n"
            b"NOTICE:  00000\n"
            b"ERROR:  42501\n"
        )
        if classify_restore_failure(restore_log, phase_nonce) != ("data", "42501"):
            raise AssertionError("bare command SQLSTATE was classified incorrectly")

        invalid_logs = (
            phase_prefix + b"secrets\nERROR:  42501\n",
            phase_prefix + b"schema\nERROR:  42501\n",
            phase_prefix + b"roles\nraw error without a SQLSTATE\n",
            (
                phase_prefix + b"roles\n"
                + b"psql:/packet-a-restore/roles.sql:1: ERROR:  42501\n"
                + b"psql:/packet-a-restore/roles.sql:2: ERROR:  42P07\n"
            ),
            b"PACKET_A_B2_PHASE=ffffffffffffffffffffffffffffffff:roles\n"
            b"psql:/packet-a-restore/roles.sql:1: ERROR:  42501\n",
            phase_prefix + b"roles\nERROR:  A1B2C\n",
            phase_prefix + b"roles\nERROR:  00000\n",
            (
                phase_prefix + b"roles\n"
                + b"psql:/packet-a-restore/schema.sql:1: ERROR:  42P07\n"
            ),
            (
                phase_prefix + b"roles\n"
                + b"psql:/packet-a-restore/roles.sql:1: ERROR:  42501\n"
                + b"psql: error: client-side failure\n"
            ),
            (
                phase_prefix + b"roles\n"
                + b"psql:/packet-a-restore/roles.sql:1: ERROR:  42501\n"
                + b"connection to server was lost\n"
            ),
            (
                phase_prefix + b"roles\n"
                + b"psql:/packet-a-restore/roles.sql:1: NOTICE:  A1B2C\n"
                + b"psql:/packet-a-restore/roles.sql:2: ERROR:  42501\n"
            ),
            b"row PACKET_A_B2_PHASE=data\nERROR:  23505\n",
        )
        for payload in invalid_logs:
            restore_log.write_bytes(payload)
            try:
                classify_restore_failure(restore_log, phase_nonce)
            except ValueError:
                pass
            else:
                raise AssertionError("unsafe or ambiguous restore log was classified")

        restore_log.write_bytes(
            phase_prefix
            + b"roles\n"
            + b"psql:/packet-a-restore/roles.sql:1: ERROR:  42501\n"
        )
        try:
            classify_restore_failure(restore_log, "not-a-valid-private-nonce")
        except ValueError:
            pass
        else:
            raise AssertionError("invalid expected phase nonce was accepted")

        valid_contract = (
            RESTORE_LOG_PATH_CONTRACT
            + RESTORE_NONCE_CONTRACT
            + RESTORE_EXECUTION_CONTRACT
            + RESTORE_FAILURE_CONTRACT
            + "\nfi\n"
        )
        check_restore_command_contract(valid_contract)

        reordered_tail = RESTORE_EXECUTION_TAIL.replace(
            '  --command "\\\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:roles" \\\n'
            "  --file /packet-a-restore/roles.sql \\\n"
            '  --command "\\\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:schema" \\\n'
            "  --file /packet-a-restore/schema.sql \\\n"
            '  --command "\\\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:data" \\\n',
            '  --command "\\\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:roles" \\\n'
            '  --command "\\\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:schema" \\\n'
            '  --command "\\\\warn PACKET_A_B2_PHASE=$PHASE_NONCE:data" \\\n'
            "  --file /packet-a-restore/roles.sql \\\n"
            "  --file /packet-a-restore/schema.sql \\\n",
        )
        contract_mutations = (
            valid_contract.replace(RESTORE_EXECUTION_TAIL, reordered_tail),
            valid_contract.replace("  --set=ON_ERROR_STOP=1 \\\n", ""),
            valid_contract.replace(
                '  >"$RESTORE_LOG" 2>"$RESTORE_ERROR_LOG"; then',
                '  --set=VERBOSITY=verbose \\\n'
                '  >"$RESTORE_LOG" 2>"$RESTORE_ERROR_LOG"; then',
            ),
            valid_contract.replace(
                "  -X \\\n",
                "  -X \\\n  --echo-all \\\n",
            ),
            valid_contract.replace(RESTORE_FAILURE_CONTRACT, "\n  exit 1"),
            valid_contract.replace(
                RESTORE_FAILURE_CONTRACT,
                RESTORE_FAILURE_CONTRACT
                + '\n  sed -n "1p" "$RESTORE_ERROR_LOG"',
            ),
            valid_contract.replace(
                RESTORE_EXECUTION_CONTRACT,
                "PHASE_NONCE=00000000000000000000000000000000\n"
                + RESTORE_EXECUTION_CONTRACT,
            ),
            valid_contract.replace("secrets.token_hex(16)", "'0' * 32"),
            valid_contract
            + '\nsed -n "1p" "$RESTORE_LOG"\n',
            valid_contract
            + "\nsed -n '1p' \"${RESTORE_ERROR_LOG}\"\n",
            valid_contract
            + '\nsed -n "1p" "$WORK_DIR/restore.log"\n',
        )
        for payload in contract_mutations:
            try:
                check_restore_command_contract(payload)
            except ValueError:
                pass
            else:
                raise AssertionError("unsafe restore command mutation passed contract")


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    extract_parser = subparsers.add_parser("extract")
    extract_parser.add_argument("data_sql", type=Path)
    extract_parser.add_argument("output", type=Path)

    compare_parser = subparsers.add_parser("compare")
    compare_parser.add_argument("expected", type=Path)
    compare_parser.add_argument("actual", type=Path)

    metadata_parser = subparsers.add_parser("metadata")
    metadata_parser.add_argument("metadata_json", type=Path)

    artifact_parser = subparsers.add_parser("artifact")
    artifact_parser.add_argument("archive", type=Path)
    artifact_parser.add_argument("destination", type=Path)

    classify_parser = subparsers.add_parser("classify-restore")
    classify_parser.add_argument("restore_error_log", type=Path)
    classify_parser.add_argument("phase_nonce")

    contract_parser = subparsers.add_parser("contract")
    contract_parser.add_argument("workflow", type=Path)
    contract_parser.add_argument("restore_script", type=Path)

    subparsers.add_parser("selftest")
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
        elif args.command == "classify-restore":
            phase, sqlstate = classify_restore_failure(
                args.restore_error_log, args.phase_nonce
            )
            print(f"phase={phase} sqlstate={sqlstate}")
        elif args.command == "contract":
            check_contract(args.workflow, args.restore_script)
        else:
            selftest()
    except (OSError, ValueError, AssertionError, json.JSONDecodeError, zipfile.BadZipFile) as error:
        print(f"packet-a B-2 check failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
