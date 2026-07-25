#!/usr/bin/env python3
"""audit.py — six-dimension audit + the standing pre-build checklist.

Run against the JSX source before packaging. Prints findings, exits non-zero
if any BLOCKER is found. WARN items are reported for a human to judge.
"""
import re, sys, collections

SRC = sys.argv[1] if len(sys.argv) > 1 else 'src/App.jsx'
raw = open(SRC, encoding='utf8').read()
lines = raw.split('\n')

blockers, warns, notes = [], [], []
B = blockers.append; W = warns.append; N = notes.append

# ── strip comments and string/template literals so scans don't fire on prose ──
def strip_noise(s):
    out, i, n = [], 0, len(s)
    while i < n:
        c = s[i]
        if c == '/' and i+1 < n and s[i+1] == '/':
            j = s.find('\n', i); j = n if j < 0 else j
            out.append(' ' * (j-i)); i = j
        elif c == '/' and i+1 < n and s[i+1] == '*':
            j = s.find('*/', i+2); j = n if j < 0 else j+2
            out.append(re.sub(r'[^\n]', ' ', s[i:j])); i = j
        elif c in '"\'`':
            q, j = c, i+1
            while j < n:
                if s[j] == '\\': j += 2; continue
                if s[j] == q: j += 1; break
                j += 1
            out.append(re.sub(r'[^\n]', ' ', s[i:j])); i = j
        else:
            out.append(c); i += 1
    return ''.join(out)

code = strip_noise(raw)
code_lines = code.split('\n')

# ── 1. CORRECTNESS ───────────────────────────────────────────────────────────
# duplicate top-level declarations
tops = collections.Counter(re.findall(r'^function\s+([A-Za-z_$][\w$]*)\s*\(', raw, re.M))
for name, c in tops.items():
    if c > 1: B(f"[1 correctness] duplicate top-level function: {name} ({c}x)")

# every JSX component tag used must be declared somewhere
XML_OK = {'Worksheet','Workbook','Cell','Row','Table','Column','Data','Style',
          'Font','Section','Interior','Styles','Alignment','Borders','Border'}
declared = set(re.findall(r'function\s+([A-Za-z_$][\w$]*)\s*[\(<]', raw)) \
         | set(re.findall(r'(?:const|let|var)\s+([A-Z][\w$]*)\s*=', raw)) \
         | set(re.findall(r'class\s+([A-Z][\w$]*)', raw)) \
         | set(re.findall(r'([A-Z][\w$]*)\s*:\s*(?:function|\()', raw))
used = set(re.findall(r'<([A-Z][\w$]*)[\s/>]', raw))
missing = sorted(used - declared - XML_OK - {'React'})
for m in missing:
    B(f"[1 correctness] JSX component used but never declared: <{m}>")

# TDZ: a hook initializer referring to something declared later in the same file
decl_line = {}
for i, l in enumerate(code_lines, 1):
    for m in re.finditer(r'(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)', l):
        decl_line.setdefault(m.group(1), i)
hook_init = re.compile(r'use(?:State|Ref|Memo)\s*\(')
for i, l in enumerate(code_lines, 1):
    if not hook_init.search(l): continue
    for ident in set(re.findall(r'\b([A-Za-z_$][\w$]{2,})\b', l)):
        d = decl_line.get(ident)
        if d and d > i and ident not in tops and ident not in declared:
            W(f"[1 correctness] possible TDZ: L{i} hook initializer uses '{ident}' declared at L{d}")

# ── 2. DATA ──────────────────────────────────────────────────────────────────
if 'GOCSPX' in raw: B("[2 data] a Google client SECRET (GOCSPX) is present in source")
for m in re.finditer(r'window\.storage\.set\(\s*([A-Z_][A-Z0-9_]*)\s*,', code):
    B(f"[2 data] unscoped storage write with a bare key constant: {m.group(1)} (must go through pk()/pkG())")
for pat, label in [(r'sk-ant-api\d', 'Anthropic key'), (r'AIza[0-9A-Za-z_\-]{20,}', 'Google API key')]:
    if re.search(pat, raw): W(f"[2 data] literal {label} found in source")

# ── 3. PERFORMANCE ───────────────────────────────────────────────────────────
adds = len(re.findall(r'addEventListener\(', code))
rems = len(re.findall(r'removeEventListener\(', code))
N(f"[3 performance] addEventListener {adds} / removeEventListener {rems}"
  + ("  (known-good gaps: GIS loader, global click, self-removing drag handlers)" if adds > rems else ""))
if adds - rems > 8: W(f"[3 performance] {adds-rems} listeners added without a matching remove — review")

# ── 4. SECURITY ──────────────────────────────────────────────────────────────
if re.search(r'\beval\s*\(', code): B("[4 security] eval() present")
if re.search(r'new\s+Function\s*\(', code): B("[4 security] new Function() present")
dw = len(re.findall(r'document\.write\(', code))
ih = len(re.findall(r'\.innerHTML\s*=', code))
dsi = len(re.findall(r'dangerouslySetInnerHTML', code))
N(f"[4 security] document.write {dw} · innerHTML assignments {ih} · dangerouslySetInnerHTML {dsi}")
if dsi: B("[4 security] dangerouslySetInnerHTML present")
# every document.write payload should be sanitised or self-built
for i, l in enumerate(lines, 1):
    if 'document.write(' in l and 'sanitize' not in l:
        N(f"[4 security] document.write at L{i} — confirm its payload is built by the app, not pasted content")

# ── 5. UX ────────────────────────────────────────────────────────────────────
tries = len(re.findall(r'\btry\s*\{', code))
catches = len(re.findall(r'(?<!\.)\bcatch\s*[\({]', code))
N(f"[5 ux] try {tries} / catch {catches}")
if tries != catches: W(f"[5 ux] try/catch mismatch ({tries}/{catches})")
if 'ConfirmDialog' not in raw: W("[5 ux] ConfirmDialog not used anywhere")

# ── 6. MAINTAINABILITY ───────────────────────────────────────────────────────
cl = [i for i, l in enumerate(code_lines, 1) if re.search(r'\bconsole\.log\s*\(', l)]
if cl: B(f"[6 maintainability] console.log at lines {cl[:12]}{'…' if len(cl)>12 else ''} (must be 0)")

# ══ PRE-BUILD CHECKLIST ══════════════════════════════════════════════════════
print("=" * 74)
print("PRE-BUILD CHECKLIST")
print("=" * 74)

# 1) hardcoded dark hex that should be a CSS variable
BRAND = {'#166534'}
dark = collections.Counter()
for m in re.finditer(r'#([0-9a-fA-F]{6})\b', raw):
    hexv = '#' + m.group(1).lower()
    if hexv in BRAND: continue
    r_, g_, b_ = (int(m.group(1)[i:i+2], 16) for i in (0, 2, 4))
    if (r_*299 + g_*587 + b_*114) / 1000 < 60: dark[hexv] += 1
print(f"1. hardcoded dark hex colours : {sum(dark.values())} occurrences, {len(dark)} distinct")
if dark:
    print("   most common:", ', '.join(f"{k}×{v}" for k, v in dark.most_common(6)))
    print("   (brand green #166534 excluded; these belong to print/export CSS and")
    print("    fixed-palette theme tables, which are intentionally literal)")

# 2) hooks after an early return, inside component functions
HOOK = re.compile(r'\buse(?:State|Effect|Ref|Memo|Callback|LayoutEffect|Reducer)\s*\(')
bad_hooks = []
comp_starts = [(i, m.group(1)) for i, l in enumerate(code_lines, 1)
               for m in [re.match(r'function\s+([A-Z][\w$]*)\s*\(', l)] if m]
for idx, (start, name) in enumerate(comp_starts):
    end = comp_starts[idx+1][0] - 1 if idx+1 < len(comp_starts) else len(code_lines)
    depth = 0; ret_at = None
    for i in range(start, min(end, len(code_lines)) + 1):
        l = code_lines[i-1]
        # only a return at the component's own top level counts as an early return
        if re.match(r'\s{2}return\b', l) and depth <= 1 and ret_at is None and i > start:
            ret_at = i
        if ret_at and HOOK.search(l): bad_hooks.append((name, ret_at, i)); break
        depth += l.count('{') - l.count('}')
print(f"2. hooks after an early return: {len(bad_hooks)} suspected")
for name, r_, h in bad_hooks[:8]:
    print(f"   {name}: return L{r_} then hook L{h}  ← verify by hand (returns inside useMemo look identical to a regex)")

# 3) identifiers used in the new code that were never declared
NEW = ['DirectionDialog', 'sanitizeNoteHTML', 'safeImageSrc', 'taskImages',
       'gsyncAcceptLocal', 'gsyncAcceptCloud', 'payloadCounts', 'ImportDirectionDialog']
print("3. new components / helpers declared:")
for nme in NEW:
    d = bool(re.search(r'(?:function|const|let|var)\s+' + re.escape(nme) + r'\b', code))
    u = len(re.findall(r'\b' + re.escape(nme) + r'\b', code))
    print(f"   {'OK ' if d else 'MISSING'}  {nme:22} declared={d}  references={u}")
    if not d: B(f"[checklist] {nme} referenced but never declared")

# ── report ───────────────────────────────────────────────────────────────────
print()
print("=" * 74)
print("SIX-DIMENSION AUDIT")
print("=" * 74)
for x in notes:    print("NOTE   ", x)
for x in warns:    print("WARN   ", x)
for x in blockers: print("BLOCKER", x)
print()
print(f"blockers={len(blockers)}  warnings={len(warns)}")
sys.exit(1 if blockers else 0)
