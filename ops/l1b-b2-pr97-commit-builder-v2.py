#!/usr/bin/env python3
"""Run the exact PR97 builder while preserving stdout and stderr evidence."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess
import sys

MODULE_PATH = Path(__file__).with_name("l1b-b2-pr97-commit-builder.py")
spec = importlib.util.spec_from_file_location("l1b_b2_pr97_commit_builder", MODULE_PATH)
if spec is None or spec.loader is None:
    raise SystemExit("unable to load exact builder module")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def merged_run(*args: str, cwd: Path | None = None, env: dict[str, str] | None = None) -> str:
    completed = subprocess.run(
        args,
        cwd=cwd,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=True,
    )
    return completed.stdout.strip()


module.run = merged_run
raise SystemExit(module.main())
