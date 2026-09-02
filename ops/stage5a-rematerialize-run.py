#!/usr/bin/env python3
"""Repair the temporary generated patch program in memory, then execute it.

The branch-only generator was intentionally not run from an unverified local
checkout. This runner replaces one known truncated tail, compiles the complete
program before execution, and fails if the expected tail has drifted.
"""
from pathlib import Path

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
