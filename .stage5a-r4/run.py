from pathlib import Path

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
replacements = {
    'mobileConflictBlock': 'pull',
    'mobileRecoveryBlock': 'resume',
}
for old_name, new_name in replacements.items():
    count = test_text.count(old_name)
    print(f'NORMALIZE {old_name} -> {new_name}: count={count}')
    if count:
        test_text = test_text.replace(old_name, new_name)
test_path.write_text(test_text, encoding='utf-8')
