#!/usr/bin/env python3
"""Build the exact one-commit PR97 recovery source without moving any ref."""
from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request

REPOSITORY = "champban/dashboard"
BASE_SHA = "297854c09205097a6a58cbce4c64961c802cd7a3"
BASE_TREE = "c25d9b044e7a46963c3fc5661bd53b08f48d83d6"
TARGET_HEAD = "fe1e175ac1b95b1dbf2f2813171d65376cd4c402"
FIX_HEAD = "1fbaf773c1125bd54e5cd93b2a21afd761d36bf7"
FIX_BLOB = "55fc12f22741d8e8bac1cb011b6994cacc9f5681"

EXPECTED_BLOBS = {
    ".github/workflows/l1b-post-import-isolated-restore.yml": "2fbe48b20d93ec7cebd843343c866953de5183d5",
    "docs/L1B_POST_IMPORT_RESTORE.md": "ab1cca10f717b5eb95ddc0a5c6a05bd1b69ac5fb",
    "ops/l1b-post-import-isolated-restore-acl-check.sh": "bf8c60e8c91025a8366edf0c26cf9b4920be8b5b",
    "ops/l1b-post-import-isolated-restore-acl-patch.py": "102165a3f3af1dc8b654bb055775cf3d8f9c448f",
    "ops/l1b-post-import-isolated-restore-aicc-check.py": "33fb7d4c1f4330e499cd426470bb9fb68ff1d4e2",
    "ops/l1b-post-import-isolated-restore-check.py": "ecc8ba98880a234494b210e8f2f5c5c162f4b995",
    "ops/l1b-post-import-isolated-restore-core.sh": "cd1b6f33235364b05b94051e9b1264f22437c85a",
    "ops/l1b-post-import-isolated-restore-count-check.py": "e4ba0307a3154ab00bff7bbd016bf5f08bb4771c",
    "ops/l1b-post-import-isolated-restore-review-check.sh": "cbe4ada3a7e9e9eeb9d93c178297a2a40931b293",
    "ops/l1b-post-import-isolated-restore-stdin-patch.py": "838d2d68c9eb608ae56e92883c17cd3058fe0b0a",
    "ops/l1b-post-import-isolated-restore-telemetry.sh": "97ef2ac0ccffba5631e032bca94583636ad19e59",
    "ops/l1b-post-import-isolated-restore.sh": "35f1d24a57885e4836f41e778eb8c9e62e81711b",
}

ATTEMPT_SECTION = """## Previous fail-closed attempts

### AICC default-function-ACL ordering — run `33630389296`

The exact recovery source restored the encrypted B-1 into the network-disabled
PostgreSQL 17 target and passed exact-count, post-import, catalog, index and
complete schema-semantics checks. It then stopped fail closed at raw ACL
reconciliation: AICC expected `305/e2aeb59ccf1b7cf4fd3d32799d1e91c6`
but restored `299/8036afaa87de193d3ce344886499efb6`; the isolated
work directory, containers, inherited volume, artifact files and passphrase
were removed, and the sole recovery PASS marker was not emitted.

A bounded read-only Production comparison proved the delta exactly. The six
existing zero-argument AICC functions each have `PUBLIC EXECUTE` in Production,
while the restored target lacked precisely those six ACL entries. The restored
AICC function-ACL lane was `24/2f54344395605a43a14b2975d36bc8d6`; adding
only those verified grants produces the exact Production lane
`30/253113c16f13c2be2022b8db3453997b` and the already frozen complete
AICC raw-ACL fingerprint. This is a deterministic logical-dump/default-ACL
ordering effect: pg_dump omits privileges equal to the source creation defaults,
while the disposable target intentionally revokes the postgres default function
ACL before replaying schema DDL.

The corrected recovery source therefore performs one narrowly bounded
normalization inside the existing roles/schema/data transaction, after schema
creation and before data loading. It first requires the exact 24-part restored
fingerprint, grants `PUBLIC EXECUTE` to exactly
`aicc_add_owner_membership()`, `aicc_audit_agent_status()`,
`aicc_audit_message_insert()`, `aicc_audit_task_status()`,
`aicc_set_updated_at()` and `aicc_task_timestamps()`, then requires the exact
30-part Production fingerprint. Any missing, extra or changed ACL entry stops
the restore before reconciliation PASS. No Production connection or write is
introduced.

"""


def run(*args: str, cwd: Path | None = None, env: dict[str, str] | None = None) -> str:
    completed = subprocess.run(
        args,
        cwd=cwd,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return completed.stdout.strip()


def git_blob(path: Path) -> str:
    payload = path.read_bytes()
    return hashlib.sha1(f"blob {len(payload)}\0".encode("ascii") + payload).hexdigest()


def replace_once(payload: str, old: str, new: str, label: str) -> str:
    count = payload.count(old)
    if count != 1:
        raise SystemExit(f"{label}: anchor count {count}, expected 1")
    return payload.replace(old, new, 1)


def validate_checkout(target: Path, fix: Path) -> None:
    if run("git", "rev-parse", "HEAD", cwd=target) != TARGET_HEAD:
        raise SystemExit("target recovery head mismatch")
    if run("git", "merge-base", BASE_SHA, "HEAD", cwd=target) != BASE_SHA:
        raise SystemExit("target recovery base mismatch")
    if run("git", "rev-list", "--count", f"{BASE_SHA}..HEAD", cwd=target) != "1":
        raise SystemExit("target recovery source is not one commit")
    if run("git", "rev-parse", "HEAD", cwd=fix) != FIX_HEAD:
        raise SystemExit("recovery fix head mismatch")
    fix_script = fix / "ops/l1b-b2-aicc-acl-recovery-fix.sh"
    if git_blob(fix_script) != FIX_BLOB:
        raise SystemExit("recovery fix blob mismatch")


def apply_recovery_fix(target: Path, fix: Path) -> None:
    output = run("bash", str(fix / "ops/l1b-b2-aicc-acl-recovery-fix.sh"), str(target))
    if "L1B_B2_AICC_ACL_RECOVERY_FIX=PASS" not in output.splitlines():
        raise SystemExit("recovery fix did not emit PASS")


def patch_workflow(target: Path) -> None:
    path = target / ".github/workflows/l1b-post-import-isolated-restore.yml"
    payload = path.read_text(encoding="utf-8")
    replacements = {
        "f5e4493aef14b96c58f698afe13f654d2e55b59e": "35f1d24a57885e4836f41e778eb8c9e62e81711b",
        "ec3a6fa2811ca0e4354ce77d6ca8953f261b32e4": "cd1b6f33235364b05b94051e9b1264f22437c85a",
        "48d1333429095cb6922c16bb457875b12ba0b9ca": "2c853a685309f576d88d5ee3e49bc53c1ab2b7df",
        "9f24a55337b5358f0c902c6ee852503625504dde": "78ed7ba8bb0ebc0673a1c0575728b23131a2c9de",
    }
    for old, new in replacements.items():
        if old not in payload:
            raise SystemExit(f"workflow pin missing: {old}")
        payload = payload.replace(old, new)
    path.write_text(payload, encoding="utf-8", newline="\n")


def patch_document(target: Path) -> None:
    path = target / "docs/L1B_POST_IMPORT_RESTORE.md"
    payload = path.read_text(encoding="utf-8")
    replacements = {
        "19078dac4743025d0dcb220f8a8cc199721b37b1": "2fbe48b20d93ec7cebd843343c866953de5183d5",
        "f5e4493aef14b96c58f698afe13f654d2e55b59e": "35f1d24a57885e4836f41e778eb8c9e62e81711b",
        "ec3a6fa2811ca0e4354ce77d6ca8953f261b32e4": "cd1b6f33235364b05b94051e9b1264f22437c85a",
        "48d1333429095cb6922c16bb457875b12ba0b9ca": "2c853a685309f576d88d5ee3e49bc53c1ab2b7df",
        "9f24a55337b5358f0c902c6ee852503625504dde": "78ed7ba8bb0ebc0673a1c0575728b23131a2c9de",
    }
    for old, new in replacements.items():
        payload = replace_once(payload, old, new, f"document pin {old}")
    payload = replace_once(
        payload,
        "## Previous fail-closed attempts\n\n",
        ATTEMPT_SECTION,
        "document attempt section",
    )
    path.write_text(payload, encoding="utf-8", newline="\n")


def validate_result(target: Path) -> None:
    run("git", "diff", "--check", cwd=target)
    changed = sorted(run("git", "diff", "--name-only", cwd=target).splitlines())
    if changed != sorted(
        [
            ".github/workflows/l1b-post-import-isolated-restore.yml",
            "docs/L1B_POST_IMPORT_RESTORE.md",
            "ops/l1b-post-import-isolated-restore-core.sh",
            "ops/l1b-post-import-isolated-restore.sh",
        ]
    ):
        raise SystemExit(f"unexpected remediated paths: {changed}")
    for relative, expected in EXPECTED_BLOBS.items():
        path = target / relative
        if not path.is_file() or path.is_symlink():
            raise SystemExit(f"unsafe remediated source: {relative}")
        actual = git_blob(path)
        if actual != expected:
            raise SystemExit(f"remediated blob mismatch: {relative} {actual}")
    with tempfile.TemporaryDirectory(prefix="l1b-b2-pr97-selftest-") as temp:
        environment = os.environ.copy()
        environment["RUNNER_TEMP"] = temp
        output = run(
            "bash",
            "ops/l1b-post-import-isolated-restore.sh",
            "--selftest",
            cwd=target,
            env=environment,
        )
    required = {
        "L1B_B2_STDIN_SAFE_CORE_BLOB=2c853a685309f576d88d5ee3e49bc53c1ab2b7df",
        "L1B_B2_REVIEWED_CORE_BLOB=78ed7ba8bb0ebc0673a1c0575728b23131a2c9de",
        "L1B B-2 role-independent staged cleanup-hardened source verification: PASS",
    }
    if not required.issubset(set(output.splitlines())):
        raise SystemExit("remediated wrapper selftest output mismatch")


def api_request(path: str, payload: dict[str, object]) -> dict[str, object]:
    token = os.environ.get("GH_TOKEN", "")
    if not token:
        raise SystemExit("GH_TOKEN is absent")
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.github.com/repos/{REPOSITORY}{path}",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def publish_commit(target: Path) -> tuple[str, str]:
    entries: list[dict[str, str]] = []
    for relative, expected in EXPECTED_BLOBS.items():
        path = target / relative
        result = api_request(
            "/git/blobs",
            {
                "content": base64.b64encode(path.read_bytes()).decode("ascii"),
                "encoding": "base64",
            },
        )
        actual = result.get("sha")
        if actual != expected:
            raise SystemExit(f"remote blob mismatch: {relative} {actual}")
        entries.append({"path": relative, "mode": "100644", "type": "blob", "sha": expected})
    tree = api_request("/git/trees", {"base_tree": BASE_TREE, "tree": entries})
    tree_sha = tree.get("sha")
    if not isinstance(tree_sha, str) or len(tree_sha) != 40:
        raise SystemExit("tree creation failed")
    commit = api_request(
        "/git/commits",
        {
            "message": "ops(l1b): normalize exact AICC ACL recovery semantics",
            "tree": tree_sha,
            "parents": [BASE_SHA],
        },
    )
    commit_sha = commit.get("sha")
    if not isinstance(commit_sha, str) or len(commit_sha) != 40:
        raise SystemExit("commit creation failed")
    return commit_sha, tree_sha


def write_outputs(commit_sha: str, tree_sha: str) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as output:
            output.write(f"commit_sha={commit_sha}\ntree_sha={tree_sha}\n")


def main() -> int:
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} TARGET_CHECKOUT FIX_CHECKOUT", file=sys.stderr)
        return 2
    target = Path(sys.argv[1]).resolve()
    fix = Path(sys.argv[2]).resolve()
    validate_checkout(target, fix)
    apply_recovery_fix(target, fix)
    patch_workflow(target)
    patch_document(target)
    validate_result(target)
    commit_sha, tree_sha = publish_commit(target)
    write_outputs(commit_sha, tree_sha)
    print(f"L1B_B2_PR97_REMEDIATED_COMMIT={commit_sha}")
    print(f"L1B_B2_PR97_REMEDIATED_TREE={tree_sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
