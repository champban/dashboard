#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:?usage: $0 TARGET_CHECKOUT}"
BASE='297854c09205097a6a58cbce4c64961c802cd7a3'
HEAD='fe1e175ac1b95b1dbf2f2813171d65376cd4c402'
CORE='ops/l1b-post-import-isolated-restore-core.sh'
WRAPPER='ops/l1b-post-import-isolated-restore.sh'

[[ -d "$ROOT/.git" ]]
[[ "$(git -C "$ROOT" rev-parse HEAD)" == "$HEAD" ]]
[[ "$(git -C "$ROOT" merge-base "$BASE" HEAD)" == "$BASE" ]]
[[ "$(git -C "$ROOT" rev-list --count "$BASE"..HEAD)" == 1 ]]

check_blob(){ [[ "$(git -C "$ROOT" hash-object "$1")" == "$2" ]]; }
check_blob "$WRAPPER" f5e4493aef14b96c58f698afe13f654d2e55b59e
check_blob ops/l1b-post-import-isolated-restore-telemetry.sh 97ef2ac0ccffba5631e032bca94583636ad19e59
check_blob ops/l1b-post-import-isolated-restore-acl-patch.py 102165a3f3af1dc8b654bb055775cf3d8f9c448f
check_blob ops/l1b-post-import-isolated-restore-stdin-patch.py 838d2d68c9eb608ae56e92883c17cd3058fe0b0a
check_blob "$CORE" ec3a6fa2811ca0e4354ce77d6ca8953f261b32e4
check_blob ops/l1b-post-import-isolated-restore-check.py ecc8ba98880a234494b210e8f2f5c5c162f4b995
check_blob ops/l1b-post-import-isolated-restore-count-check.py e4ba0307a3154ab00bff7bbd016bf5f08bb4771c
check_blob ops/l1b-post-import-isolated-restore-acl-check.sh bf8c60e8c91025a8366edf0c26cf9b4920be8b5b
check_blob ops/l1b-post-import-isolated-restore-review-check.sh cbe4ada3a7e9e9eeb9d93c178297a2a40931b293
check_blob ops/l1b-post-import-isolated-restore-aicc-check.py 33fb7d4c1f4330e499cd426470bb9fb68ff1d4e2

python3 - "$ROOT/$CORE" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text(encoding='utf-8')
def once(old,new,label):
    global s
    if s.count(old)!=1: raise SystemExit(f'{label}: anchor mismatch')
    s=s.replace(old,new,1)
functions=(
'aicc_add_owner_membership','aicc_audit_agent_status','aicc_audit_message_insert',
'aicc_audit_task_status','aicc_set_updated_at','aicc_task_timestamps')
grants='\n'.join(f'GRANT EXECUTE ON FUNCTION public.{name}() TO PUBLIC;' for name in functions)
query="""SELECT count(*),md5(coalesce(string_agg(part,E'\\n' ORDER BY part),'')) INTO n,d
FROM (
 SELECT 'FUNACL|'||n.nspname||'|'||p.proname||'|'||
        pg_catalog.pg_get_function_identity_arguments(p.oid)||'|'||
        pg_catalog.pg_get_userbyid(x.grantor)||'|'||
        pg_catalog.pg_get_userbyid(x.grantee)||'|'||x.privilege_type||'|'||
        x.is_grantable::text AS part
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN LATERAL pg_catalog.aclexplode(
   coalesce(p.proacl,pg_catalog.acldefault('f'::\"char\",p.proowner))) x
 WHERE n.nspname='public' AND p.proname LIKE 'aicc_%'
) parts"""
sql=f"""DO $pre$
DECLARE n bigint; d text;
BEGIN {query};
 IF n<>24 OR d<>'2f54344395605a43a14b2975d36bc8d6' THEN
  RAISE EXCEPTION 'unexpected pre-normalization AICC function ACL fingerprint';
 END IF;
END;$pre$;
{grants}
DO $post$
DECLARE n bigint; d text;
BEGIN {query};
 IF n<>30 OR d<>'253113c16f13c2be2022b8db3453997b' THEN
  RAISE EXCEPTION 'unexpected post-normalization AICC function ACL fingerprint';
 END IF;
END;$post$;"""
anchor="""if ! python3 \"$CHECKER\" extract \"$EXTRACT_DIR/data.sql\" \"$EXPECTED_COUNTS\" >\"$CORE_COUNT_CHECK_LOG\" 2>&1; then
  echo '::error::L1B_B2_CORE_COUNT_CHECK_FAILED stage=exact-count'
  exit 1
fi

# Restore roles -> schema -> data as one transaction. Normalize only the known
"""
replacement=f"""if ! python3 \"$CHECKER\" extract \"$EXTRACT_DIR/data.sql\" \"$EXPECTED_COUNTS\" >\"$CORE_COUNT_CHECK_LOG\" 2>&1; then
  echo '::error::L1B_B2_CORE_COUNT_CHECK_FAILED stage=exact-count'
  exit 1
fi

AICC_LEGACY_PUBLIC_ACL_SQL=\"$EXTRACT_DIR/l1b-b2-aicc-legacy-public-execute.sql\"
cat >\"$AICC_LEGACY_PUBLIC_ACL_SQL\" <<'SQL'
{sql}
SQL
chmod 600 \"$AICC_LEGACY_PUBLIC_ACL_SQL\"

# Restore roles -> schema -> data as one transaction. Normalize only the known
"""
once(anchor,replacement,'overlay SQL')
once("""  --command 'SET ROLE postgres;' \\
  --file /l1b-restore/schema.sql \\
  --command 'RESET ROLE;' \\
""","""  --command 'SET ROLE postgres;' \\
  --file /l1b-restore/schema.sql \\
  --file /l1b-restore/l1b-b2-aicc-legacy-public-execute.sql \\
  --command 'RESET ROLE;' \\
""",'overlay execution')
if s.count('GRANT EXECUTE ON FUNCTION public.aicc_')!=6: raise SystemExit('grant count mismatch')
if s.count('l1b-b2-aicc-legacy-public-execute.sql')!=2: raise SystemExit('overlay path mismatch')
p.write_text(s,encoding='utf-8',newline='\n')
PY

CORE_BLOB="$(git -C "$ROOT" hash-object "$CORE")"
python3 - "$ROOT/$WRAPPER" "$CORE_BLOB" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text(encoding='utf-8'); value=sys.argv[2]
old="EXPECTED_CORE_BLOB='ec3a6fa2811ca0e4354ce77d6ca8953f261b32e4'"
if s.count(old)!=1: raise SystemExit('core pin anchor mismatch')
s=s.replace(old,f"EXPECTED_CORE_BLOB='{value}'",1)
p.write_text(s,encoding='utf-8',newline='\n')
PY

TMP="$(mktemp -d)"; trap 'rm -rf -- "$TMP"' EXIT
python3 "$ROOT/ops/l1b-post-import-isolated-restore-stdin-patch.py" patch \
  "$ROOT/$CORE" "$TMP/stdin.sh" --kind core --expected-fixes 3 | grep -Fxq 'L1B_B2_STDIN_FIXES=3'
python3 "$ROOT/ops/l1b-post-import-isolated-restore-stdin-patch.py" audit "$TMP/stdin.sh"
python3 "$ROOT/ops/l1b-post-import-isolated-restore-acl-patch.py" "$TMP/stdin.sh" "$TMP/reviewed.sh"
STDIN_BLOB="$(git -C "$ROOT" hash-object "$TMP/stdin.sh")"
REVIEWED_BLOB="$(git -C "$ROOT" hash-object "$TMP/reviewed.sh")"
python3 - "$ROOT/$WRAPPER" "$STDIN_BLOB" "$REVIEWED_BLOB" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text(encoding='utf-8')
for old,new in (
("EXPECTED_STDIN_SAFE_CORE_BLOB='48d1333429095cb6922c16bb457875b12ba0b9ca'",f"EXPECTED_STDIN_SAFE_CORE_BLOB='{sys.argv[2]}'"),
("EXPECTED_REVIEWED_CORE_BLOB='9f24a55337b5358f0c902c6ee852503625504dde'",f"EXPECTED_REVIEWED_CORE_BLOB='{sys.argv[3]}'")):
 if s.count(old)!=1: raise SystemExit('derived pin anchor mismatch')
 s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8',newline='\n')
PY

mapfile -t changed < <(git -C "$ROOT" diff --name-only | sort)
[[ "${#changed[@]}" == 2 && "${changed[0]}" == "$CORE" && "${changed[1]}" == "$WRAPPER" ]]
git -C "$ROOT" diff --check
bash -n "$ROOT/$CORE"; bash -n "$ROOT/$WRAPPER"
RUNNER_TEMP="${RUNNER_TEMP:-$TMP}" bash "$ROOT/$WRAPPER" --selftest >/dev/null
printf 'L1B_B2_AICC_ACL_RECOVERY_FIX=PASS\nCORE_BLOB=%s\nSTDIN_BLOB=%s\nREVIEWED_BLOB=%s\n' \
  "$CORE_BLOB" "$STDIN_BLOB" "$REVIEWED_BLOB"
