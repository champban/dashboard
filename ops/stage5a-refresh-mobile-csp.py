#!/usr/bin/env python3
"""Recalculate the exact CSP hashes for every Mobile inline script."""
from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "mobile/index.html"
text = path.read_text(encoding="utf-8")
scripts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>", text)
if not scripts:
    raise SystemExit("no Mobile inline scripts found")

hashes: list[str] = []
for script in scripts:
    value = base64.b64encode(hashlib.sha256(script.encode("utf-8")).digest()).decode("ascii")
    if value not in hashes:
        hashes.append(value)

pattern = re.compile(r'(<meta http-equiv="Content-Security-Policy" content=")([^"]+)(">)')
match = pattern.search(text)
if not match:
    raise SystemExit("Mobile CSP meta tag not found")

directives = [part.strip() for part in match.group(2).split(";") if part.strip()]
for index, directive in enumerate(directives):
    tokens = directive.split()
    if tokens and tokens[0] == "script-src":
        base_tokens = [token for token in tokens if not token.startswith("'sha256-")]
        directives[index] = " ".join(base_tokens + [f"'sha256-{value}'" for value in hashes])
        break
else:
    raise SystemExit("Mobile script-src directive not found")

content = "; ".join(directives)
text = text[: match.start(2)] + content + text[match.end(2) :]
path.write_text(text, encoding="utf-8")
print(f"Mobile CSP refreshed for {len(scripts)} inline scripts / {len(hashes)} unique hashes")
