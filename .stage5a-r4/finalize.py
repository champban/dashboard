from __future__ import annotations

import base64
import gzip
import hashlib
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path.cwd()
PAYLOAD = ROOT / ".stage5a-r4" / "patch.py.gz.b64.exact"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    print(f"PATCH {label}: exact_count={count}")
    if count != 1:
        raise SystemExit(f"{label}: expected 1 exact match, found {count}")
    return text.replace(old, new, 1)


normalized = "".join(PAYLOAD.read_text(encoding="utf-8").split()).encode()
if sha256_bytes(normalized) != "4aa90f9ae9758b0959aab589922bcd11c72454faf52660bb181e66f0affe55fb":
    raise SystemExit("payload checksum mismatch")
packed = base64.b64decode(normalized, validate=True)
if sha256_bytes(packed) != "999f926a00dc11d23bd8147f89f18d5b8c24750abd6d47c147c897f1d80a567e":
    raise SystemExit("gzip checksum mismatch")
script_bytes = gzip.decompress(packed)
if sha256_bytes(script_bytes) != "fac74c75081bd1155f60f720e6ff7d98ada9208e1c2a1f82f99ee163812860a5":
    raise SystemExit("decoded script checksum mismatch")
script = script_bytes.decode("utf-8")

# The checksum-pinned script was built against an earlier equivalent Mobile
# helper spelling. Rewrite only that anchor definition in the temporary decoded
# script; the staged payload remains verified above.
start = script.index("mobile_name_old = '''")
mid = script.index("mobile_name_new = '''", start)
end = script.index("\nmobile = replace_once(mobile, mobile_name_old", mid)
old_target = (
    "function lineRecoveryCopyName(){const base=cleanCloudName(state.sync.fileName||'My-Todo-Planner.json').replace(/\\.json$/i,''),"
    "d=new Date(),p=n=>String(n).padStart(2,'0');return`${base} (conflicted copy before LINE recovery "
    "${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}).json`}\n"
    "async function reopenLineCompletionConflict"
)
new_target = (
    "function lineRecoveryCopyName(){const base=cleanCloudName(state.sync.fileName||'My-Todo-Planner.json').replace(/\\.json$/i,''),"
    "d=new Date(),p=n=>String(n).padStart(2,'0');return`${base} (conflicted copy before LINE recovery "
    "${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}).json`}\n"
    "function lineRecoveryLocalCopyName(){const base=cleanCloudName(state.sync.fileName||'My-Todo-Planner.json').replace(/\\.json$/i,''),"
    "d=new Date(),p=n=>String(n).padStart(2,'0');return`${base} (conflicted copy from this device after LINE recovery started "
    "${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}).json`}\n"
    "async function preserveMobileLocalEdits(provided){let checkpoint=provided;for(let attempt=0;attempt<3;attempt++){"
    "const local=cloneProfileData(state.data),localCanonical=recoveryLocalCanonical(local);"
    "if(localCanonical===checkpoint.localBaselineCanonical||localCanonical===checkpoint.preservedLocalCanonical)return checkpoint;"
    "const meta=await driveMeta(checkpoint.fileId),parent=meta.parents?.[0]||'';"
    "const made=await driveCreate(lineRecoveryLocalCopyName(),JSON.stringify(local,null,2),parent);"
    "if(!made?.id)throw Error('Could not verify the local recovery conflict copy on Google Drive.');"
    "checkpoint={...checkpoint,preservedLocalCanonical:localCanonical,preservedLocalCopyName:made.name||''};"
    "persistLineCompletion(checkpoint);if(recoveryLocalCanonical(state.data)===localCanonical)return checkpoint}"
    "throw Error('This device kept changing during LINE recovery. Stop editing and try again.')}\n"
    "async function reopenLineCompletionConflict"
)
assignments = "mobile_name_old = " + repr(old_target) + "\nmobile_name_new = " + repr(new_target)
script = script[:start] + assignments + script[end:]

# Current Mobile already owns setDriveBusy/finally in this helper, and its
# checkpoint field ordering differs from the earlier patch source. Skip those
# three obsolete exact-anchor calls; normalize them against current source below.
skip_labels = {
    "Mobile blocked-resolution single flight",
    "Mobile blocked-resolution finally",
    "Mobile local baseline checkpoint",
}
normalized_lines = []
for line in script.splitlines():
    if "replace_once" in line and any(f'"{label}"' in line for label in skip_labels):
        normalized_lines.append("mobile = mobile  # normalized by finalizer")
    else:
        normalized_lines.append(line)
script = "\n".join(normalized_lines) + "\n"

compile(script, "stage5a-r4-decoded.py", "exec")
with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".py", delete=False) as handle:
    handle.write(script)
    decoded_path = Path(handle.name)
try:
    subprocess.run([sys.executable, str(decoded_path)], cwd=ROOT, check=True)
finally:
    decoded_path.unlink(missing_ok=True)

mobile_path = ROOT / "mobile" / "index.html"
mobile = mobile_path.read_text(encoding="utf-8")
mobile = replace_once(
    mobile,
    "targetCanonical:canonicalJSON(payload),modifiedTime:currentMeta.modifiedTime||'',\n          payload,mutationIds:[...mutationIds],rejected:[...rejected]};",
    "targetCanonical:canonicalJSON(payload),modifiedTime:currentMeta.modifiedTime||'',\n          localBaselineCanonical:recoveryLocalCanonical(state.data),\n          payload,mutationIds:[...mutationIds],rejected:[...rejected]};",
    "Mobile local baseline checkpoint",
)
mobile = replace_once(
    mobile,
    "async function resolveBlockedLineCompletion(){\n  const checkpoint=state.sync.lineCompletion;\n  if(!checkpoint||checkpoint.phase!=='blocked')return false;\n  const rejected=Array.isArray(checkpoint.rejected)?checkpoint.rejected:[];\n  try{\n    setDriveBusy(true);",
    "async function resolveBlockedLineCompletion(){\n  if(state.driveBusy)return false;\n  const checkpoint=state.sync.lineCompletion;\n  if(!checkpoint||checkpoint.kind!==MOBILE_LINE_COMPLETION_KIND||checkpoint.phase!=='blocked')return false;\n  const rejected=Array.isArray(checkpoint.rejected)?checkpoint.rejected:[];\n  try{\n    setDriveBusy(true);",
    "Mobile blocked-recovery single flight",
)

# Final clean-review finding: a single-use completion checkpoint belongs to its
# original Drive file. Refuse relinking until that recovery is resolved.
mobile = replace_once(
    mobile,
    "async function linkCloudFile(id,name){try{setDriveBusy(true);",
    "async function linkCloudFile(id,name){if(state.driveBusy)return;if(state.sync.lineCompletion){"
    "state.driveError='Finish the pending LINE recovery before switching cloud files.';"
    "toast(state.driveError);render();return}try{setDriveBusy(true);",
    "Mobile pending-recovery relink guard",
)
mobile_path.write_text(mobile, encoding="utf-8")

# Pin the relink guard before any new-file download/file-id replacement.
tests_path = ROOT / "build" / "line-contract.test.mjs"
tests = tests_path.read_text(encoding="utf-8")
if "Mobile must block relinking before downloading" not in tests:
    anchor = "assert.match(mobileConflictBlock, /Keep both and finish LINE recovery/);"
    block = r'''
const mobileRelinkAt = mobile.indexOf("async function linkCloudFile(id,name){");
const mobileRelinkEnd = mobile.indexOf("async function createCloudFile", mobileRelinkAt);
const mobileRelinkBlock = mobile.slice(mobileRelinkAt, mobileRelinkEnd);
assert.ok(mobileRelinkAt >= 0, "Mobile relink handler must exist");
assert.match(mobileRelinkBlock, /if\(state\.driveBusy\)return/);
assert.match(mobileRelinkBlock, /state\.sync\.lineCompletion/);
assert.ok(mobileRelinkBlock.indexOf("state.sync.lineCompletion") < mobileRelinkBlock.indexOf("driveDownload"),
  "Mobile must block relinking before downloading or switching to another Drive file");
'''.rstrip()
    tests = replace_once(tests, anchor, anchor + block, "Mobile relink regression")
tests_path.write_text(tests, encoding="utf-8")

changelog_path = ROOT / "CHANGELOG.md"
changelog = changelog_path.read_text(encoding="utf-8")
line = (
    "- Mobile refuses to relink to another Drive file while a single-use LINE completion checkpoint is pending, "
    "preventing the old mutation from being lost or re-prepared on a new file.\n"
)
if line not in changelog:
    heading = "## Unreleased — Stage 5A no-migration cloud conflict safety — 2026-09-02\n\n"
    changelog = replace_once(changelog, heading, heading + line, "Stage 5A changelog relink record")
changelog_path.write_text(changelog, encoding="utf-8")

stage_path = ROOT / "docs" / "STAGE5A_NO_MIGRATION_RELEASE.md"
stage = stage_path.read_text(encoding="utf-8")
if "## Final relink safety closure" not in stage:
    stage = stage.rstrip() + """

## Final relink safety closure

- Mobile blocks selection of another Drive file while a durable LINE completion checkpoint exists. The pending mutation must be reconciled on its original file before relinking, so the same confirmed mutation cannot be lost or re-prepared against a different file.
- `build/line-contract.test.mjs` pins the guard before any new-file download or file-id replacement.
""" + "\n"
stage_path.write_text(stage, encoding="utf-8")

context_path = ROOT / "PROJECT_CONTEXT.md"
context = context_path.read_text(encoding="utf-8")
context_note = (
    "- **Stage 5A pending-recovery relink guard:** Mobile refuses to switch Drive files while `lineCompletion` exists. "
    "The exact mutation IDs remain bound to their original file until completion/reconciliation, preventing cross-file loss or duplicate preparation.\n"
)
if context_note.strip() not in context:
    context = replace_once(context, "## Open backlog\n", context_note + "\n## Open backlog\n", "PROJECT_CONTEXT relink record")
context_path.write_text(context, encoding="utf-8")

expected = {
    "CHANGELOG.md",
    "PROJECT_CONTEXT.md",
    "build/line-contract.test.mjs",
    "build/sync-content-check.test.mjs",
    "docs/STAGE5A_NO_MIGRATION_RELEASE.md",
    "mobile/index.html",
    "src/App.jsx",
}
changed = set(
    subprocess.check_output(["git", "diff", "--name-only"], cwd=ROOT, text=True).splitlines()
)
if changed != expected:
    raise SystemExit(f"pre-build boundary mismatch: expected={sorted(expected)} actual={sorted(changed)}")
print("Stage 5A final source patch prepared: PASS")
