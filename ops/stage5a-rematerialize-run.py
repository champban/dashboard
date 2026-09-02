#!/usr/bin/env python3
"""Repair the temporary generated patch program in memory, then execute it.

The branch-only generator was intentionally not run from an unverified local
checkout. This runner replaces one known truncated tail, compiles the complete
program before execution, then refreshes Mobile CSP hashes from the exact
resulting inline-script bytes. Every step fails closed on source drift.
"""
from pathlib import Path
import base64
import hashlib
import re

script = Path(__file__).with_name("stage5a-rematerialize.py")
source = script.read_text(encoding="utf-8")
bad_tail = 'stage = stage_path.read_text(encoding="utf-8")n\n'
if source.count(bad_tail) != 1:
    raise SystemExit(f"temporary generator tail drifted: {source.count(bad_tail)} matches")
record_tail = '''stage = stage_path.read_text(encoding="utf-8")
if "## Implementation record" in stage:
    raise SystemExit("Stage 5A implementation record already exists")
stage += """

## Implementation record

Status: **IMPLEMENTED ON DRAFT SOURCE BRANCH / VERIFICATION REQUIRED**

Changed source and test boundary:

- `src/App.jsx` — final cloud-wins import decision prepares pending LINE
  mutations, uploads the merged payload before completing IDs/adopting locally,
  and retains the unresolved conflict on upload failure.
- `mobile/index.html` — final downloaded cloud payload follows prepare → upload
  → complete → adopt ordering; failed uploads do not close the conflict.
- `build/sync-content-check.test.mjs` — executable success/failure ordering
  regressions for Full and Mobile.
- `build/line-contract.test.mjs` — static ordering, rejection-message and
  fail-closed contract pins.
- `PROJECT_CONTEXT.md` — backlog closure and `LINE-CLOUD-ADOPT-1` prevention
  control.
- `CHANGELOG.md` — source-only candidate record.
- Generated `index.html` and `BUILD-MANIFEST.json` are refreshed only by the
  normal repository verification/package pipeline.

This implementation does not change Database, migrations, Storage, Auth, RLS,
providers, Environment, secrets, backup/recovery, import/reconciliation,
activation, deployment or Production. PR merge remains a separate Owner gate.
"""
stage_path.write_text(stage, encoding="utf-8")

print("Stage 5A deterministic source rematerialization: COMPLETE")
'''
source = source.replace(bad_tail, record_tail, 1)
namespace = {"__file__": str(script), "__name__": "__main__"}
exec(compile(source, str(script), "exec"), namespace)

# The Mobile application keeps inline scripts under exact CSP hashes. Any byte
# change must refresh the hash list in the same source change; stale hashes are
# removed rather than accumulated.
mobile_path = script.parents[1] / "mobile/index.html"
mobile = mobile_path.read_text(encoding="utf-8")
inline_scripts = [
    match.group(1)
    for match in re.finditer(
        r"<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>",
        mobile,
        re.IGNORECASE,
    )
]
if not inline_scripts:
    raise SystemExit("mobile/index.html: no inline scripts found for CSP refresh")
new_hashes = [
    "'sha256-"
    + base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode("ascii")
    + "'"
    for body in inline_scripts
]
meta_pattern = re.compile(
    r'(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")',
    re.IGNORECASE,
)
meta_match = meta_pattern.search(mobile)
if not meta_match:
    raise SystemExit("mobile/index.html: CSP meta tag not found")
csp = meta_match.group(2)
directives = [part.strip() for part in csp.split(";") if part.strip()]
script_indexes = [index for index, part in enumerate(directives) if part.startswith("script-src ")]
if script_indexes != [1]:
    raise SystemExit(f"mobile/index.html: unexpected script-src directive indexes {script_indexes}")
script_index = script_indexes[0]
tokens = directives[script_index].split()
old_hashes = [token for token in tokens[1:] if re.fullmatch(r"'sha256-[A-Za-z0-9+/=]+'", token)]
if len(old_hashes) != len(inline_scripts):
    raise SystemExit(
        "mobile/index.html: existing CSP hash count does not match inline-script count "
        f"({len(old_hashes)} != {len(inline_scripts)})"
    )
non_hash_sources = [
    token for token in tokens[1:]
    if not re.fullmatch(r"'sha256-[A-Za-z0-9+/=]+'", token)
]
directives[script_index] = "script-src " + " ".join(non_hash_sources + new_hashes)
new_csp = "; ".join(directives)
if csp.endswith(";"):
    new_csp += ";"
mobile = meta_pattern.sub(
    lambda match: match.group(1) + new_csp + match.group(3),
    mobile,
    count=1,
)
mobile_path.write_text(mobile, encoding="utf-8")

verified_mobile = mobile_path.read_text(encoding="utf-8")
for token in new_hashes:
    if token not in verified_mobile:
        raise SystemExit(f"mobile/index.html: refreshed CSP token missing: {token}")
print(f"Mobile CSP refresh: PASS ({len(new_hashes)} inline scripts)")
