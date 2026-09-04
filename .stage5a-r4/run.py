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
