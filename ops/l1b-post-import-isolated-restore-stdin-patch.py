#!/usr/bin/env python3
"""Deterministically repair heredoc stdin and inject fixed B-2 stage diagnostics."""
from __future__ import annotations
import argparse, pathlib, re, stat, sys, tempfile

HEREDOC=re.compile(r"<<-?\s*['\"]?[A-Za-z_][A-Za-z0-9_]*['\"]?")
INTERACTIVE=re.compile(r"(?:^|[\s\\])(?:--interactive|-i)(?=$|[\s\\])")
DOCKER_EXEC=re.compile(r"\bdocker\s+exec\b")
BASE_ACL_PATH='BASE_ACL_CHECKER="$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore-acl-check.sh"'
PATCHED_BASE_ACL_PATH='BASE_ACL_CHECKER="${L1B_B2_PATCHED_BASE_ACL_CHECKER:-$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore-acl-check.sh}"'
BASE_ACL_HASH='[[ "$(git -C "$GITHUB_WORKSPACE" hash-object "$BASE_ACL_CHECKER")" == "$BASE_ACL_CHECKER_BLOB" ]]'
PATCHED_BASE_ACL_HASH='[[ "$(git -C "$GITHUB_WORKSPACE" hash-object "$BASE_ACL_CHECKER")" == "${L1B_B2_PATCHED_BASE_ACL_CHECKER_BLOB:-$BASE_ACL_CHECKER_BLOB}" ]]'
STAGES=("exact-count","postcheck","catalog","index","raw-acl","default-acl","all-function-acl","effective-privilege","role-graph","aicc-count","fk-fingerprint","fk-row-validation","private-storage")

def replace_once(payload,old,new,label):
    count=payload.count(old)
    if count!=1: raise ValueError(f"{label} anchor count is {count}, expected 1")
    return payload.replace(old,new,1)

def command_start(lines,i):
    while i>0 and lines[i-1].rstrip("\r\n").rstrip().endswith("\\"): i-=1
    return i

def heredoc_docker_blocks(payload):
    lines=payload.splitlines(keepends=True); out=[]
    for i,line in enumerate(lines):
        if not HEREDOC.search(line): continue
        start=command_start(lines,i); block="".join(lines[start:i+1])
        if DOCKER_EXEC.search(block): out.append((start,i))
    return out

def missing_blocks(payload):
    lines=payload.splitlines(keepends=True); out=[]
    for start,end in heredoc_docker_blocks(payload):
        block="".join(lines[start:end+1]); match=HEREDOC.search(block)
        if match is None: raise ValueError("heredoc inventory changed during audit")
        if not INTERACTIVE.search(block[:match.start()]): out.append((start,end))
    return out

def patch_stdin(payload):
    lines=payload.splitlines(keepends=True); fixes=0
    for start,end in missing_blocks(payload):
        for i in range(start,end+1):
            if DOCKER_EXEC.search(lines[i]):
                lines[i],count=DOCKER_EXEC.subn("docker exec --interactive",lines[i],count=1)
                if count!=1: raise ValueError("unable to patch heredoc-backed docker exec")
                fixes+=1; break
        else: raise ValueError("docker exec command line was not found")
    patched="".join(lines)
    if missing_blocks(patched): raise ValueError("heredoc-backed docker exec remains without stdin")
    return patched,fixes


def patch_private_stderr(payload):
    """Keep every heredoc-backed psql diagnostic in its runner-private output file."""
    lines=payload.splitlines(keepends=True); fixes=0
    for start,end in heredoc_docker_blocks(payload):
        block="".join(lines[start:end+1])
        if "psql " not in block or ">" not in block or "2>&1" in block:
            continue
        line=lines[end]
        match=HEREDOC.search(line)
        if match is None or ">" not in line[:match.start()]:
            raise ValueError("heredoc-backed psql output redirection is outside the frozen command line")
        prefix=line[:match.start()].rstrip()
        suffix=line[match.start():]
        lines[end]=prefix+" 2>&1 "+suffix
        fixes+=1
    return "".join(lines),fixes


def missing_private_stderr_blocks(payload):
    lines=payload.splitlines(keepends=True); missing=[]
    for start,end in heredoc_docker_blocks(payload):
        block="".join(lines[start:end+1])
        if "psql " in block and ">" in block and "2>&1" not in block:
            missing.append((start,end))
    return missing

def patch_base_acl(payload):
    payload=replace_once(payload,'DEFAULT_ACL_FINGERPRINT="$WORK_DIR/default-acl-fingerprint.tsv"\n\n','DEFAULT_ACL_FINGERPRINT="$WORK_DIR/default-acl-fingerprint.tsv"\n\nl1b_b2_set_stage \'raw-acl\'\n\n','base raw stage')
    old=("grep -Fxq $'AICC\\t'\"$EXPECTED_AICC_ACL_PARTS\"$'\\t'\"$EXPECTED_AICC_ACL_FINGERPRINT\" \"$ACL_FINGERPRINTS\"\n" "grep -Fxq $'L0B\\t'\"$EXPECTED_L0B_ACL_PARTS\"$'\\t'\"$EXPECTED_L0B_ACL_FINGERPRINT\" \"$ACL_FINGERPRINTS\"\n" "grep -Fxq $'LINE\\t'\"$EXPECTED_LINE_ACL_PARTS\"$'\\t'\"$EXPECTED_LINE_ACL_FINGERPRINT\" \"$ACL_FINGERPRINTS\"\n\n")
    new=("l1b_b2_assert_triplet raw-acl AICC \"$EXPECTED_AICC_ACL_PARTS\" \"$EXPECTED_AICC_ACL_FINGERPRINT\" \"$ACL_FINGERPRINTS\"\n" "l1b_b2_assert_triplet raw-acl L0B \"$EXPECTED_L0B_ACL_PARTS\" \"$EXPECTED_L0B_ACL_FINGERPRINT\" \"$ACL_FINGERPRINTS\"\n" "l1b_b2_assert_triplet raw-acl LINE \"$EXPECTED_LINE_ACL_PARTS\" \"$EXPECTED_LINE_ACL_FINGERPRINT\" \"$ACL_FINGERPRINTS\"\n\n" "l1b_b2_set_stage 'default-acl'\n\n")
    payload=replace_once(payload,old,new,'base raw assertions')
    payload=replace_once(payload,"grep -Fxq \"$EXPECTED_POSTGRES_DEFAULT_ACL_PARTS\"$'\\t'\"$EXPECTED_POSTGRES_DEFAULT_ACL_FINGERPRINT\" \"$DEFAULT_ACL_FINGERPRINT\"\n","l1b_b2_assert_pair default-acl DEFAULT_ACL \"$EXPECTED_POSTGRES_DEFAULT_ACL_PARTS\" \"$EXPECTED_POSTGRES_DEFAULT_ACL_FINGERPRINT\" \"$DEFAULT_ACL_FINGERPRINT\"\n",'base default assertion')
    return payload

def patch_review(payload):
    payload=replace_once(payload,BASE_ACL_PATH,PATCHED_BASE_ACL_PATH,'review base path')
    payload=replace_once(payload,BASE_ACL_HASH,PATCHED_BASE_ACL_HASH,'review base hash')
    payload=replace_once(payload,'AICC_ACTUAL_COUNTS="$WORK_DIR/aicc-actual-counts.tsv"\nAICC_CHECK_LOG="$WORK_DIR/aicc-count-check.log"\n\n','AICC_ACTUAL_COUNTS="$WORK_DIR/aicc-actual-counts.tsv"\nAICC_CHECK_LOG="$WORK_DIR/aicc-count-check.log"\nFK_ROW_VALIDATION_LOG="$WORK_DIR/fk-row-validation.log"\n\nl1b_b2_set_stage \'all-function-acl\'\n\n','review function stage')
    payload=replace_once(payload,"grep -Fxq \"$EXPECTED_L0B_ALL_FUNCTION_ACL_PARTS\"$'\\t'\"$EXPECTED_L0B_ALL_FUNCTION_ACL_FINGERPRINT\" \"$FUNCTION_FINGERPRINT\"\n\n# Evaluate direct effective privileges and the direct membership option surface.\n","l1b_b2_assert_pair all-function-acl ALL_FUNCTION_ACL \"$EXPECTED_L0B_ALL_FUNCTION_ACL_PARTS\" \"$EXPECTED_L0B_ALL_FUNCTION_ACL_FINGERPRINT\" \"$FUNCTION_FINGERPRINT\"\n\n# Evaluate direct effective privileges and the direct membership option surface.\nl1b_b2_set_stage 'effective-privilege'\n",'review function/effective')
    old=("grep -Fxq $'AICC\\t'\"$EXPECTED_AICC_EFFECTIVE_PARTS\"$'\\t'\"$EXPECTED_AICC_EFFECTIVE_FINGERPRINT\" \"$EFFECTIVE_FINGERPRINTS\"\n" "grep -Fxq $'L0B\\t'\"$EXPECTED_L0B_EFFECTIVE_PARTS\"$'\\t'\"$EXPECTED_L0B_EFFECTIVE_FINGERPRINT\" \"$EFFECTIVE_FINGERPRINTS\"\n" "grep -Fxq $'LINE\\t'\"$EXPECTED_LINE_EFFECTIVE_PARTS\"$'\\t'\"$EXPECTED_LINE_EFFECTIVE_FINGERPRINT\" \"$EFFECTIVE_FINGERPRINTS\"\n" "grep -Fxq $'RUNTIME\\t'\"$EXPECTED_RUNTIME_EFFECTIVE_PARTS\"$'\\t'\"$EXPECTED_RUNTIME_EFFECTIVE_FINGERPRINT\" \"$EFFECTIVE_FINGERPRINTS\"\n")
    new=("l1b_b2_assert_triplet effective-privilege AICC \"$EXPECTED_AICC_EFFECTIVE_PARTS\" \"$EXPECTED_AICC_EFFECTIVE_FINGERPRINT\" \"$EFFECTIVE_FINGERPRINTS\"\n" "l1b_b2_assert_triplet effective-privilege L0B \"$EXPECTED_L0B_EFFECTIVE_PARTS\" \"$EXPECTED_L0B_EFFECTIVE_FINGERPRINT\" \"$EFFECTIVE_FINGERPRINTS\"\n" "l1b_b2_assert_triplet effective-privilege LINE \"$EXPECTED_LINE_EFFECTIVE_PARTS\" \"$EXPECTED_LINE_EFFECTIVE_FINGERPRINT\" \"$EFFECTIVE_FINGERPRINTS\"\n" "l1b_b2_assert_triplet effective-privilege RUNTIME \"$EXPECTED_RUNTIME_EFFECTIVE_PARTS\" \"$EXPECTED_RUNTIME_EFFECTIVE_FINGERPRINT\" \"$EFFECTIVE_FINGERPRINTS\"\n")
    payload=replace_once(payload,old,new,'review effective assertions')
    payload=replace_once(payload,'# inheritance edges from each runtime role, including every PG17 membership option.\ndocker exec --interactive',"# inheritance edges from each runtime role, including every PG17 membership option.\nl1b_b2_set_stage 'role-graph'\ndocker exec --interactive",'review role stage')
    payload=replace_once(payload,"grep -Fxq $'ROLE_GRAPH\\t'\"$EXPECTED_RUNTIME_ROLE_GRAPH_PARTS\"$'\\t'\"$EXPECTED_RUNTIME_ROLE_GRAPH_FINGERPRINT\" \"$ROLE_GRAPH_FINGERPRINT\"\n\n# Reconcile every frozen AICC COPY section against restored rows and Production.\n","l1b_b2_assert_triplet role-graph ROLE_GRAPH \"$EXPECTED_RUNTIME_ROLE_GRAPH_PARTS\" \"$EXPECTED_RUNTIME_ROLE_GRAPH_FINGERPRINT\" \"$ROLE_GRAPH_FINGERPRINT\"\n\n# Reconcile every frozen AICC COPY section against restored rows and Production.\nl1b_b2_set_stage 'aicc-count'\n",'review role/aicc')
    payload=replace_once(payload,'# Freeze the complete public application FK inventory before validating rows.\ndocker exec --interactive',"# Freeze the complete public application FK inventory before validating rows.\nl1b_b2_set_stage 'fk-fingerprint'\ndocker exec --interactive",'review fk fingerprint stage')
    payload=replace_once(payload,"grep -Fxq \"$EXPECTED_PUBLIC_APP_FK_PARTS\"$'\\t'\"$EXPECTED_PUBLIC_APP_FK_FINGERPRINT\" \"$FK_FINGERPRINT\"\n","l1b_b2_assert_pair fk-fingerprint FK \"$EXPECTED_PUBLIC_APP_FK_PARTS\" \"$EXPECTED_PUBLIC_APP_FK_FINGERPRINT\" \"$FK_FINGERPRINT\"\n",'review fk fingerprint assertion')
    payload=replace_once(payload,'# every current public mtp_*/aicc_* FK without printing any row value.\ndocker exec --interactive',"# every current public mtp_*/aicc_* FK without printing any row value.\nl1b_b2_set_stage 'fk-row-validation'\nif ! docker exec --interactive",'review fk row stage')
    payload=replace_once(payload,"  --single-transaction --set=ON_ERROR_STOP=1 <<'SQL'\n","  --single-transaction --set=ON_ERROR_STOP=1 >\"$FK_ROW_VALIDATION_LOG\" 2>&1 <<'SQL'\n",'review fk private log')
    payload=replace_once(payload,"SQL\n\n# Reject orphaned private-object metadata even if the bucket and policy rows are absent.\n","SQL\nthen\n  printf '::error::L1B_B2_FK_ROW_VALIDATION_FAILED stage=fk-row-validation\\n' >&2\n  exit 1\nfi\nchmod 600 \"$FK_ROW_VALIDATION_LOG\"\n\n# Reject orphaned private-object metadata even if the bucket and policy rows are absent.\n",'review fk private failure boundary')
    payload=replace_once(payload,'# Reject orphaned private-object metadata even if the bucket and policy rows are absent.\ndocker exec --env',"# Reject orphaned private-object metadata even if the bucket and policy rows are absent.\nl1b_b2_set_stage 'private-storage'\ndocker exec --env",'review private stage')
    payload=replace_once(payload,'  >\"$PRIVATE_OBJECT_COUNT\"\n','  >\"$PRIVATE_OBJECT_COUNT\" 2>&1\n','review private stderr')
    payload=replace_once(payload,"grep -Fxq '0' \"$PRIVATE_OBJECT_COUNT\"\n","l1b_b2_assert_zero private-storage MTP_PRIVATE_OBJECTS \"$PRIVATE_OBJECT_COUNT\"\n",'review private assertion')
    return payload

def patch_kind(payload,kind):
    patched,fixes=patch_stdin(payload)
    if kind=='base-acl': patched=patch_base_acl(patched)
    elif kind=='review': patched=patch_review(patched)
    patched,private_fixes=patch_private_stderr(patched)
    if missing_private_stderr_blocks(patched):
        raise ValueError('heredoc-backed fingerprint diagnostics remain public')
    return patched,fixes,private_fixes

def patch_file(source,output,kind,expected_fixes):
    if source.is_symlink() or not source.is_file(): raise ValueError('stdin-patch input is absent or unsafe')
    if output.exists() or output.is_symlink(): raise ValueError('stdin-patch output already exists or is unsafe')
    patched,fixes,private_fixes=patch_kind(source.read_text(encoding='utf-8',errors='strict'),kind)
    if expected_fixes is not None and fixes!=expected_fixes: raise ValueError(f'stdin-patch fix count differs: actual={fixes}, expected={expected_fixes}')
    output.write_text(patched,encoding='utf-8',newline='\n')
    output.chmod(0o700 if source.stat().st_mode & stat.S_IXUSR else 0o600)
    print(f'L1B_B2_STDIN_FIXES={fixes}')
    return fixes

def audit_file(source):
    if source.is_symlink() or not source.is_file(): raise ValueError('stdin-audit input is absent or unsafe')
    payload=source.read_text(encoding='utf-8',errors='strict')
    missing=missing_blocks(payload)
    if missing: raise ValueError('heredoc-backed docker exec lacks --interactive')
    if missing_private_stderr_blocks(payload): raise ValueError('heredoc-backed fingerprint diagnostics are not private')
    if '>\"$PRIVATE_OBJECT_COUNT\"' in payload and '>\"$PRIVATE_OBJECT_COUNT\" 2>&1' not in payload:
        raise ValueError('private-storage diagnostics are not private')

def selftest():
    fixture="""#!/usr/bin/env bash\nset -euo pipefail\ndocker exec --env PGPASSWORD=x db \\\n  psql -Xq <<'SQL'\nselect 1;\nSQL\ndocker exec --interactive --env PGPASSWORD=x db \\\n  psql -Xq <<'SQL'\nselect 2;\nSQL\ncat <<'TEXT'\nnot docker\nTEXT\n"""
    fixture=fixture.replace("psql -Xq <<'SQL'", "psql -Xq >\"$OUT\" <<'SQL'", 1)
    patched,fixes,private_fixes=patch_kind(fixture,'core')
    if fixes!=1 or private_fixes!=1 or missing_blocks(patched) or missing_private_stderr_blocks(patched) or patched.count('docker exec --interactive')!=2 or ">\"$OUT\" 2>&1 <<'SQL'" not in patched: raise AssertionError('stdin/private-stderr patch selftest failed')
    with tempfile.TemporaryDirectory(prefix='l1b-b2-stdin-selftest-') as temp:
        root=pathlib.Path(temp); source=root/'source.sh'; output=root/'output.sh'
        source.write_text(fixture,encoding='utf-8'); source.chmod(0o700)
        patch_file(source,output,'core',1); audit_file(output)
        try: audit_file(source)
        except ValueError: pass
        else: raise AssertionError('stdin audit accepted unsafe heredoc exec')

def main():
    parser=argparse.ArgumentParser(); commands=parser.add_subparsers(dest='command',required=True)
    patch=commands.add_parser('patch'); patch.add_argument('source',type=pathlib.Path); patch.add_argument('output',type=pathlib.Path); patch.add_argument('--kind',choices=('core','base-acl','review'),required=True); patch.add_argument('--expected-fixes',type=int)
    audit=commands.add_parser('audit'); audit.add_argument('source',type=pathlib.Path); commands.add_parser('selftest')
    args=parser.parse_args()
    try:
        if args.command=='patch': patch_file(args.source,args.output,args.kind,args.expected_fixes)
        elif args.command=='audit': audit_file(args.source)
        else: selftest()
    except (OSError,UnicodeError,ValueError,AssertionError) as error:
        print(f'L1B B-2 stdin contract failed: {error}',file=sys.stderr); return 1
    return 0
if __name__=='__main__': raise SystemExit(main())
