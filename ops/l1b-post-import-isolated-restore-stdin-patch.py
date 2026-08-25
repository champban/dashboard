#!/usr/bin/env python3
"""Deterministically add stdin attachment to heredoc-backed docker exec calls.

Docker only forwards a heredoc to `docker exec` when `--interactive`/`-i` keeps
stdin open. This helper patches only command blocks that both invoke
`docker exec` and contain a shell heredoc. It also installs the exact override
used by the patched review checker to call its patched base-ACL helper.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import stat
import sys
import tempfile

HEREDOC = re.compile(r"<<-?\s*['\"]?[A-Za-z_][A-Za-z0-9_]*['\"]?")
INTERACTIVE = re.compile(r"(?:^|[\s\\])(?:--interactive|-i)(?=$|[\s\\])")
DOCKER_EXEC = re.compile(r"\bdocker\s+exec\b")

BASE_ACL_PATH = (
    'BASE_ACL_CHECKER="$GITHUB_WORKSPACE/ops/'
    'l1b-post-import-isolated-restore-acl-check.sh"'
)
PATCHED_BASE_ACL_PATH = (
    'BASE_ACL_CHECKER="${L1B_B2_PATCHED_BASE_ACL_CHECKER:-'
    '$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore-acl-check.sh}"'
)
BASE_ACL_HASH = (
    '[[ "$(git -C "$GITHUB_WORKSPACE" hash-object "$BASE_ACL_CHECKER")" '
    '== "$BASE_ACL_CHECKER_BLOB" ]]'
)
PATCHED_BASE_ACL_HASH = (
    '[[ "$(git -C "$GITHUB_WORKSPACE" hash-object "$BASE_ACL_CHECKER")" '
    '== "${L1B_B2_PATCHED_BASE_ACL_CHECKER_BLOB:-$BASE_ACL_CHECKER_BLOB}" ]]'
)


def command_start(lines: list[str], heredoc_line: int) -> int:
    start = heredoc_line
    while start > 0 and lines[start - 1].rstrip("\r\n").rstrip().endswith("\\"):
        start -= 1
    return start


def heredoc_docker_blocks(payload: str) -> list[tuple[int, int]]:
    lines = payload.splitlines(keepends=True)
    blocks: list[tuple[int, int]] = []
    for index, line in enumerate(lines):
        if not HEREDOC.search(line):
            continue
        start = command_start(lines, index)
        block = "".join(lines[start : index + 1])
        if DOCKER_EXEC.search(block):
            blocks.append((start, index))
    return blocks


def missing_blocks(payload: str) -> list[tuple[int, int]]:
    lines = payload.splitlines(keepends=True)
    missing: list[tuple[int, int]] = []
    for start, end in heredoc_docker_blocks(payload):
        block = "".join(lines[start : end + 1])
        match = HEREDOC.search(block)
        if match is None:
            raise ValueError("heredoc inventory changed during audit")
        before_heredoc = block[: match.start()]
        if not INTERACTIVE.search(before_heredoc):
            missing.append((start, end))
    return missing


def patch_stdin(payload: str) -> tuple[str, int]:
    lines = payload.splitlines(keepends=True)
    fixes = 0
    for start, end in missing_blocks(payload):
        for index in range(start, end + 1):
            if DOCKER_EXEC.search(lines[index]):
                lines[index], count = DOCKER_EXEC.subn(
                    "docker exec --interactive", lines[index], count=1
                )
                if count != 1:
                    raise ValueError("unable to patch heredoc-backed docker exec")
                fixes += 1
                break
        else:
            raise ValueError("docker exec command line was not found in heredoc block")
    patched = "".join(lines)
    remaining = missing_blocks(patched)
    if remaining:
        line_numbers = ",".join(str(start + 1) for start, _ in remaining)
        raise ValueError(f"heredoc-backed docker exec remains without stdin: {line_numbers}")
    return patched, fixes


def patch_kind(payload: str, kind: str) -> tuple[str, int]:
    patched, fixes = patch_stdin(payload)
    if kind == "review":
        if patched.count(BASE_ACL_PATH) != 1:
            raise ValueError("review checker base-ACL path anchor is not unique")
        if patched.count(BASE_ACL_HASH) != 1:
            raise ValueError("review checker base-ACL hash anchor is not unique")
        patched = patched.replace(BASE_ACL_PATH, PATCHED_BASE_ACL_PATH, 1)
        patched = patched.replace(BASE_ACL_HASH, PATCHED_BASE_ACL_HASH, 1)
    return patched, fixes


def patch_file(
    source: pathlib.Path,
    output: pathlib.Path,
    kind: str,
    expected_fixes: int | None,
) -> int:
    if source.is_symlink() or not source.is_file():
        raise ValueError("stdin-patch input is absent or unsafe")
    if output.exists() or output.is_symlink():
        raise ValueError("stdin-patch output already exists or is unsafe")
    payload = source.read_text(encoding="utf-8", errors="strict")
    patched, fixes = patch_kind(payload, kind)
    if expected_fixes is not None and fixes != expected_fixes:
        raise ValueError(
            f"stdin-patch fix count differs: actual={fixes}, expected={expected_fixes}"
        )
    output.write_text(patched, encoding="utf-8", newline="\n")
    output.chmod(0o700 if source.stat().st_mode & stat.S_IXUSR else 0o600)
    print(f"L1B_B2_STDIN_FIXES={fixes}")
    return fixes


def audit_file(source: pathlib.Path) -> None:
    if source.is_symlink() or not source.is_file():
        raise ValueError("stdin-audit input is absent or unsafe")
    payload = source.read_text(encoding="utf-8", errors="strict")
    missing = missing_blocks(payload)
    if missing:
        line_numbers = ",".join(str(start + 1) for start, _ in missing)
        raise ValueError(f"heredoc-backed docker exec lacks --interactive: {line_numbers}")


def selftest() -> None:
    fixture = """#!/usr/bin/env bash
set -euo pipefail
docker exec --env PGPASSWORD=x db \\
  psql -Xq <<'SQL'
select 1;
SQL
docker exec --interactive --env PGPASSWORD=x db \\
  psql -Xq <<'SQL'
select 2;
SQL
cat <<'TEXT'
not docker
TEXT
"""
    patched, fixes = patch_kind(fixture, "core")
    if fixes != 1 or missing_blocks(patched):
        raise AssertionError("stdin patch did not repair exactly one unsafe block")
    if patched.count("docker exec --interactive") != 2:
        raise AssertionError("stdin patch changed the wrong command inventory")

    review_fixture = (
        "#!/usr/bin/env bash\n"
        + "BASE_ACL_CHECKER_BLOB='abc'\n"
        + BASE_ACL_PATH
        + "\n"
        + BASE_ACL_HASH
        + "\n"
    )
    review_patched, review_fixes = patch_kind(review_fixture, "review")
    if review_fixes != 0:
        raise AssertionError("review override unexpectedly changed stdin inventory")
    if PATCHED_BASE_ACL_PATH not in review_patched:
        raise AssertionError("review checker path override was not installed")
    if PATCHED_BASE_ACL_HASH not in review_patched:
        raise AssertionError("review checker hash override was not installed")

    with tempfile.TemporaryDirectory(prefix="l1b-b2-stdin-selftest-") as temp:
        root = pathlib.Path(temp)
        source = root / "source.sh"
        output = root / "output.sh"
        source.write_text(fixture, encoding="utf-8")
        source.chmod(0o700)
        patch_file(source, output, "core", 1)
        audit_file(output)
        try:
            audit_file(source)
        except ValueError:
            pass
        else:
            raise AssertionError("stdin audit accepted an unsafe heredoc exec")


def main() -> int:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    patch = commands.add_parser("patch")
    patch.add_argument("source", type=pathlib.Path)
    patch.add_argument("output", type=pathlib.Path)
    patch.add_argument("--kind", choices=("core", "base-acl", "review"), required=True)
    patch.add_argument("--expected-fixes", type=int)
    audit = commands.add_parser("audit")
    audit.add_argument("source", type=pathlib.Path)
    commands.add_parser("selftest")
    args = parser.parse_args()
    try:
        if args.command == "patch":
            patch_file(args.source, args.output, args.kind, args.expected_fixes)
        elif args.command == "audit":
            audit_file(args.source)
        else:
            selftest()
    except (OSError, UnicodeError, ValueError, AssertionError) as error:
        print(f"L1B B-2 stdin contract failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
