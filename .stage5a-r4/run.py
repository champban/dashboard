from pathlib import Path
import base64
import hashlib
import re

path = Path('.stage5a-r4/finalize.py')
source = path.read_text(encoding='utf-8')
old = '    "Mobile local baseline checkpoint",\n}'
new = '    "Mobile local baseline checkpoint",\n    "Prevented recurrence row",\n}'
if source.count(old) != 1:
    raise SystemExit(f'finalizer skip-label anchor drifted: {source.count(old)} matches')
source = source.replace(old, new, 1)
namespace = {'__name__': '__main__', '__file__': str(path)}
exec(compile(source, str(path), 'exec'), namespace)

# The round-4 patch borrowed variable names from line-contract.test.mjs for two
# lightweight checks inserted into sync-content-check.test.mjs. Normalise them
# to the local block names that actually exist in that file.
test_path = Path('build/sync-content-check.test.mjs')
test_text = test_path.read_text(encoding='utf-8')
for old_name, new_name in {
    'mobileConflictBlock': 'pull',
    'mobileRecoveryBlock': 'resume',
}.items():
    count = test_text.count(old_name)
    print(f'NORMALIZE {old_name} -> {new_name}: count={count}')
    if count:
        test_text = test_text.replace(old_name, new_name)
test_path.write_text(test_text, encoding='utf-8')

# Mobile is hand-written and its CSP pins every inline script byte-for-byte.
# Recompute only the existing inline-script hash slots after the source patch,
# before the test suite validates the shipped document.
mobile_path = Path('mobile/index.html')
mobile = mobile_path.read_text(encoding='utf-8')
inline_scripts = [
    match.group(1)
    for match in re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>', mobile)
]
new_hashes = [
    "'sha256-" + base64.b64encode(hashlib.sha256(script.encode('utf-8')).digest()).decode('ascii') + "'"
    for script in inline_scripts
]
meta = re.search(r'(Content-Security-Policy" content=")([^"]+)(")', mobile)
if not meta:
    raise SystemExit('Mobile CSP meta tag not found')
old_hashes = re.findall(r"'sha256-[A-Za-z0-9+/=]+'", meta.group(2))
if len(old_hashes) != len(new_hashes):
    raise SystemExit(f'Mobile CSP hash slot mismatch: existing={len(old_hashes)} inline={len(new_hashes)}')
iterator = iter(new_hashes)
new_csp = re.sub(r"'sha256-[A-Za-z0-9+/=]+'", lambda _: next(iterator), meta.group(2))
mobile = mobile[:meta.start(2)] + new_csp + mobile[meta.end(2):]
mobile_path.write_text(mobile, encoding='utf-8')
print(f'Mobile CSP inline hashes refreshed: {len(new_hashes)}')
