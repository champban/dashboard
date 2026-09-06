#!/usr/bin/env bash
# Privacy-safe B-2 stage telemetry and frozen runtime verification constants.
L1B_B2_ALLOWED_STAGES=(exact-count postcheck catalog index schema-semantics raw-acl default-acl all-function-acl effective-privilege role-graph aicc-count auth-fk-fingerprint fk-fingerprint fk-row-validation private-storage)
export EXPECTED_LINE_FINGERPRINT='e0977efa7ccc1f340e753fe470d19da2' EXPECTED_L0B_FINGERPRINT='4c19c28fb80c806e01b5200b1e84edb4' EXPECTED_AICC_PRODUCTION_FINGERPRINT='4ef839fd8a717501ab3861c1e5aa3a52' EXPECTED_AICC_REL_PARTS='32' EXPECTED_AICC_REL_FINGERPRINT='77920aa928188c3c5ad5cd6663299fe9' EXPECTED_AICC_COL_PARTS='166' EXPECTED_AICC_COL_FINGERPRINT='7bfa00c87f46152bc58b797f344d1e37' EXPECTED_AICC_POL_PARTS='14' EXPECTED_AICC_POL_FINGERPRINT='29ba83e72a1444f0f340b644658bf59b' EXPECTED_AICC_FUN_PARTS='6' EXPECTED_AICC_FUN_FINGERPRINT='4a448ec93b102ce47d18818599707916' EXPECTED_LINE_INDEX_FINGERPRINT='e815ffd95253662ecc53481a825c7232' EXPECTED_L0B_INDEX_FINGERPRINT='4ae6222b2ff6f682c244344cdcbb92ff'
export EXPECTED_AICC_CONSTRAINT_PARTS='24' EXPECTED_AICC_CONSTRAINT_FINGERPRINT='2532413a689e46fc350d77137984bbc7' EXPECTED_AICC_FUNCDEF_PARTS='6' EXPECTED_AICC_FUNCDEF_FINGERPRINT='a0d2dde4e49c7c15bb2b04c7b2a2ba56' EXPECTED_AICC_INDEX_PARTS='22' EXPECTED_AICC_INDEX_FINGERPRINT='6ac0cbd6f5b79519165e2a8a453f176f' EXPECTED_AICC_TRIGGER_PARTS='9' EXPECTED_AICC_TRIGGER_FINGERPRINT='e6d867e6658d53c68a542ab6f22b920a'
export EXPECTED_L0B_CONSTRAINT_PARTS='77' EXPECTED_L0B_CONSTRAINT_FINGERPRINT='694de6dfa636f3dc11931b016e83d77f' EXPECTED_L0B_FUNCDEF_PARTS='31' EXPECTED_L0B_FUNCDEF_FINGERPRINT='5c554bfe5a9a27a7f3549c2e88d630dc' EXPECTED_L0B_SEMANTIC_INDEX_PARTS='26' EXPECTED_L0B_SEMANTIC_INDEX_FINGERPRINT='587e7bf78ebb0993165f5b0db3814182' EXPECTED_L0B_TRIGGER_PARTS='5' EXPECTED_L0B_TRIGGER_FINGERPRINT='6e059025771f56da66f5303b050a770d'
export EXPECTED_LINE_CONSTRAINT_PARTS='22' EXPECTED_LINE_CONSTRAINT_FINGERPRINT='15d1af279461fc0cda1799bb3be5cadc' EXPECTED_LINE_FUNCDEF_PARTS='0' EXPECTED_LINE_FUNCDEF_FINGERPRINT='d41d8cd98f00b204e9800998ecf8427e' EXPECTED_LINE_SEMANTIC_INDEX_PARTS='11' EXPECTED_LINE_SEMANTIC_INDEX_FINGERPRINT='0ecfcc5ee8b470ec5c47b1172c1bd1ec' EXPECTED_LINE_TRIGGER_PARTS='0' EXPECTED_LINE_TRIGGER_FINGERPRINT='d41d8cd98f00b204e9800998ecf8427e'
export EXPECTED_AICC_ACL_PARTS='305' EXPECTED_AICC_ACL_FINGERPRINT='e2aeb59ccf1b7cf4fd3d32799d1e91c6' EXPECTED_L0B_ACL_PARTS='115' EXPECTED_L0B_ACL_FINGERPRINT='a7b43c7a3182cc06b53f14f704f901f6' EXPECTED_LINE_ACL_PARTS='77' EXPECTED_LINE_ACL_FINGERPRINT='0b129a7637de9960d951052734eb1731' EXPECTED_POSTGRES_DEFAULT_ACL_PARTS='17' EXPECTED_POSTGRES_DEFAULT_ACL_FINGERPRINT='16bc8ea823eb83d037b1307f647fe1a3'
export EXPECTED_L0B_ALL_FUNCTION_ACL_PARTS='60' EXPECTED_L0B_ALL_FUNCTION_ACL_FINGERPRINT='96034c21cbd679dccb46eb2b8b2bf328' EXPECTED_AICC_EFFECTIVE_PARTS='1455' EXPECTED_AICC_EFFECTIVE_FINGERPRINT='19e50eb28495f638d0ffde9b47b11f38' EXPECTED_L0B_EFFECTIVE_PARTS='1917' EXPECTED_L0B_EFFECTIVE_FINGERPRINT='49a6233ebecc46bc50261de316257f5b' EXPECTED_LINE_EFFECTIVE_PARTS='588' EXPECTED_LINE_EFFECTIVE_FINGERPRINT='20ff81c4f39a3f9355b8faa628a60e89'
export EXPECTED_RUNTIME_EFFECTIVE_PARTS='15' EXPECTED_RUNTIME_EFFECTIVE_FINGERPRINT='a4c8b4e52e6c0ead388f34e35d5db958' EXPECTED_RUNTIME_ROLE_GRAPH_PARTS='3' EXPECTED_RUNTIME_ROLE_GRAPH_FINGERPRINT='9089adf4b82402903109f41ebc1aa10e' EXPECTED_AUTH_FK_PARTS='10' EXPECTED_AUTH_FK_FINGERPRINT='fb000e29b0a4c3aacd97a6e3a8f96766' EXPECTED_PUBLIC_APP_FK_PARTS='57' EXPECTED_PUBLIC_APP_FK_FINGERPRINT='08f4cf522b2bc18b50e3edc984946947' EXPECTED_AICC_ROW_COUNT_PARTS='8' EXPECTED_AICC_ROW_COUNT_FINGERPRINT='b6c67dcf199bba386c2d67c5b0d62624'
l1b_b2_stage_allowed(){ local c="${1:-}" s; for s in "${L1B_B2_ALLOWED_STAGES[@]}"; do [[ "$c" == "$s" ]]&&return 0; done; return 1; }
l1b_b2_set_stage(){ local s="${1:-}"; if ! l1b_b2_stage_allowed "$s"; then printf '::error::L1B_B2_STAGE_REJECTED\n' >&2; return 97; fi; export L1B_B2_STAGE="$s"; printf '::notice::L1B_B2_STAGE stage=%s\n' "$s"; }
l1b_b2_safe_parts(){ [[ "${1:-}" =~ ^[0-9]+$ ]]&&printf '%s' "$1"||printf INVALID; }; l1b_b2_safe_digest(){ [[ "${1:-}" =~ ^[0-9a-f]{32}$ ]]&&printf '%s' "$1"||printf INVALID; }
l1b_b2_validate_triplet_file(){ local stage="${1:-}" file="${2:-}"; l1b_b2_stage_allowed "$stage"||return 97; case "$stage" in catalog|index|schema-semantics|raw-acl|effective-privilege|role-graph);; *) return 97;; esac; if [[ ! -f "$file" || -L "$file" ]]; then printf '::error::L1B_B2_FINGERPRINT_FILE_INVALID stage=%s\n' "$stage" >&2; return 97; fi; if ! awk -F '\t' -v stage="$stage" '
  function add(key){ expected[key]=1; expected_count++ }
  BEGIN {
    if(stage=="catalog") { split("AICC L0B LINE",s," "); split("REL COL POL FUN GRANT",k," "); for(i in s){ add(s[i]); for(j in k)add(s[i] "_" k[j]) } }
    else if(stage=="index") { add("L0B"); add("LINE") }
    else if(stage=="schema-semantics") { split("AICC L0B LINE",s," "); split("CONSTRAINT FUNCDEF INDEX TRIGGER",k," "); for(i in s)for(j in k)add(s[i] "_" k[j]) }
    else if(stage=="raw-acl") { split("AICC L0B LINE",s," "); split("RELMETA RELACL COLACL FUNMETA FUNACL",k," "); for(i in s){ add(s[i]); for(j in k)add(s[i] "_" k[j]) } }
    else if(stage=="effective-privilege") { add("AICC"); add("L0B"); add("LINE"); add("RUNTIME") }
    else if(stage=="role-graph") add("ROLE_GRAPH")
  }
  NF!=3 || !($1 in expected) || $2!~/^[0-9]+$/ || length($3)!=32 || $3~/[^0-9a-f]/ { bad=1 }
  { seen[$1]++ }
  END { if(bad || NR!=expected_count) exit 97; for(key in expected) if(seen[key]!=1) exit 97 }
' "$file"; then printf '::error::L1B_B2_FINGERPRINT_FILE_INVALID stage=%s\n' "$stage" >&2; return 97; fi; }
l1b_b2_assert_triplet(){ local stage="${1:-}" scope="${2:-}" ep="${3:-}" ed="${4:-}" file="${5:-}" a ap=MISSING ad=MISSING; l1b_b2_stage_allowed "$stage"||return 97; case "$scope" in AICC|AICC_REL|AICC_COL|AICC_POL|AICC_FUN|L0B|LINE|RUNTIME|ROLE_GRAPH|AICC_CONSTRAINT|AICC_FUNCDEF|AICC_INDEX|AICC_TRIGGER|L0B_CONSTRAINT|L0B_FUNCDEF|L0B_INDEX|L0B_TRIGGER|LINE_CONSTRAINT|LINE_FUNCDEF|LINE_INDEX|LINE_TRIGGER);; *) return 97;; esac; [[ "$ep" =~ ^[0-9]+$ && "$ed" =~ ^[0-9a-f]{32}$ ]]||return 97; l1b_b2_validate_triplet_file "$stage" "$file"||return 97; a="$(awk -F '\t' -v scope="$scope" '$1==scope {print $2 "\t" $3}' "$file")"; ap="${a%%$'\t'*}"; ad="${a#*$'\t'}"; [[ "$ap" == "$ep" && "$ad" == "$ed" ]]&&return 0; printf '::error::L1B_B2_FINGERPRINT_MISMATCH stage=%s scope=%s expected_parts=%s expected_digest=%s actual_parts=%s actual_digest=%s\n' "$stage" "$scope" "$(l1b_b2_safe_parts "$ep")" "$(l1b_b2_safe_digest "$ed")" "$(l1b_b2_safe_parts "$ap")" "$(l1b_b2_safe_digest "$ad")" >&2; return 1; }
l1b_b2_emit_catalog_diagnostics(){ local scope="${1:-}" file="${2:-}" kind row p d i; local -a kinds=(REL COL POL FUN GRANT) parts=() digests=(); case "$scope" in AICC|L0B|LINE);; *) return 97;; esac; l1b_b2_validate_triplet_file catalog "$file"||return 97; for kind in "${kinds[@]}"; do row="$(awk -F '\t' -v key="${scope}_${kind}" '$1==key {print $2 "\t" $3}' "$file")"; p="${row%%$'\t'*}"; d="${row#*$'\t'}"; parts+=("$p"); digests+=("$d"); done; for i in "${!kinds[@]}"; do printf '::notice::L1B_B2_CATALOG_DIAGNOSTIC scope=%s kind=%s parts=%s digest=%s\n' "$scope" "${kinds[$i]}" "${parts[$i]}" "${digests[$i]}" >&2; done; }
l1b_b2_assert_catalog(){ local scope="${1:-}" ep="${2:-}" ed="${3:-}" file="${4:-}"; if l1b_b2_assert_triplet catalog "$scope" "$ep" "$ed" "$file"; then return 0; fi; l1b_b2_emit_catalog_diagnostics "$scope" "$file"||return 97; return 1; }
l1b_b2_emit_raw_acl_diagnostics(){ local scope="${1:-}" file="${2:-}" kind row p d i; local -a kinds=(RELMETA RELACL COLACL FUNMETA FUNACL) parts=() digests=(); case "$scope" in AICC|L0B|LINE);; *) return 97;; esac; l1b_b2_validate_triplet_file raw-acl "$file"||return 97; for kind in "${kinds[@]}"; do row="$(awk -F '\t' -v key="${scope}_${kind}" '$1==key {print $2 "\t" $3}' "$file")"; p="${row%%$'\t'*}"; d="${row#*$'\t'}"; parts+=("$p"); digests+=("$d"); done; for i in "${!kinds[@]}"; do printf '::notice::L1B_B2_RAW_ACL_DIAGNOSTIC scope=%s kind=%s parts=%s digest=%s\n' "$scope" "${kinds[$i]}" "${parts[$i]}" "${digests[$i]}" >&2; done; }
l1b_b2_emit_catalog_grant_diagnostic(){ local scope="${1:-}" file="${2:-}" row p d; case "$scope" in AICC|L0B|LINE);; *) return 97;; esac; l1b_b2_validate_triplet_file catalog "$file"||return 97; row="$(awk -F '\t' -v key="${scope}_GRANT" '$1==key {print $2 "\t" $3}' "$file")"; p="${row%%$'\t'*}"; d="${row#*$'\t'}"; printf '::notice::L1B_B2_CATALOG_GRANT_DIAGNOSTIC scope=%s kind=GRANT parts=%s digest=%s\n' "$scope" "$p" "$d" >&2; }
l1b_b2_assert_raw_acl(){ local scope="${1:-}" ep="${2:-}" ed="${3:-}" raw_file="${4:-}" catalog_file="${5:-}"; if l1b_b2_assert_triplet raw-acl "$scope" "$ep" "$ed" "$raw_file"; then return 0; fi; l1b_b2_emit_raw_acl_diagnostics "$scope" "$raw_file"||return 97; if [[ "$scope" == AICC ]]; then l1b_b2_emit_catalog_grant_diagnostic "$scope" "$catalog_file"||return 97; fi; return 1; }
l1b_b2_assert_pair(){ local stage="${1:-}" scope="${2:-}" ep="${3:-}" ed="${4:-}" file="${5:-}" a ap=MISSING ad=MISSING; l1b_b2_stage_allowed "$stage"||return 97; case "$scope" in DEFAULT_ACL|ALL_FUNCTION_ACL|AUTH_FK|FK);; *) return 97;; esac; [[ "$ep" =~ ^[0-9]+$ && "$ed" =~ ^[0-9a-f]{32}$ ]]||return 97; if [[ -f "$file" && ! -L "$file" ]]; then a="$(head -n 2 "$file"|tail -n 1)"; if [[ "$(wc -l < "$file")" == 1 && "$a" == *$'\t'* ]]; then ap="${a%%$'\t'*}"; ad="${a#*$'\t'}"; fi; fi; [[ "$ap" == "$ep" && "$ad" == "$ed" ]]&&return 0; printf '::error::L1B_B2_FINGERPRINT_MISMATCH stage=%s scope=%s expected_parts=%s expected_digest=%s actual_parts=%s actual_digest=%s\n' "$stage" "$scope" "$(l1b_b2_safe_parts "$ep")" "$(l1b_b2_safe_digest "$ed")" "$(l1b_b2_safe_parts "$ap")" "$(l1b_b2_safe_digest "$ad")" >&2; return 1; }
l1b_b2_assert_zero(){ local stage="${1:-}" scope="${2:-}" file="${3:-}" a=MISSING; l1b_b2_stage_allowed "$stage"||return 97; [[ "$scope" == MTP_PRIVATE_OBJECTS ]]||return 97; [[ -f "$file" && ! -L "$file" ]]&&a="$(head -n 2 "$file"|tail -n 1)"; [[ "$a" == 0 ]]&&return 0; printf '::error::L1B_B2_COUNT_MISMATCH stage=%s scope=%s expected=0 actual=%s\n' "$stage" "$scope" "$(l1b_b2_safe_parts "$a")" >&2; return 1; }
l1b_b2_failure_trap(){ local rc=$?; trap - ERR; local stage="${L1B_B2_STAGE:-pre-stage}"; if [[ "$stage" != pre-stage ]]&&l1b_b2_stage_allowed "$stage"; then printf '::error::L1B_B2_SAFE_FAILURE stage=%s\n' "$stage" >&2; else printf '::error::L1B_B2_SAFE_FAILURE\n' >&2; fi; exit "$rc"; }; trap l1b_b2_failure_trap ERR
if [[ "${1:-}" == --execute && "${BASH_SOURCE[0]}" == "$0" ]]; then
  : "${RUNNER_TEMP:?}"; : "${GITHUB_WORKSPACE:?}"; : "${GITHUB_REPOSITORY:?}"; : "${GH_TOKEN:?}"; : "${BACKUP_PASSPHRASE:?}"
  for n in EXPECTED_REPOSITORY_ID EXPECTED_BACKUP_HEAD_REF EXPECTED_SOURCE_SHA EXPECTED_BACKUP_RUN_ID EXPECTED_ARTIFACT_ID EXPECTED_ARTIFACT_NAME EXPECTED_ARTIFACT_CREATED_AT EXPECTED_ARTIFACT_EXPIRES_AT EXPECTED_ARTIFACT_ZIP_BYTES EXPECTED_ARTIFACT_ZIP_SHA256 EXPECTED_BACKUP_STAMP EXPECTED_ARCHIVE_BYTES; do [[ -n "${!n:-}" ]]||{ echo '::error::Required frozen B-2 artifact pin is absent'; exit 1; }; done
  umask 077
  pass="$RUNNER_TEMP/l1b-b2-passphrase"
  run_meta="$RUNNER_TEMP/l1b-b1-run.json"
  artifact_meta="$RUNNER_TEMP/l1b-b1-artifact.json"
  artifact_zip="$RUNNER_TEMP/l1b-b1-artifact.zip"
  artifact_dir="$RUNNER_TEMP/l1b-b2-artifact"

  ENTRYPOINT_CLEANED=0
  cleanup_entrypoint() {
    local cleanup_rc=0 path
    if [[ "$ENTRYPOINT_CLEANED" == '1' ]]; then return 0; fi
    ENTRYPOINT_CLEANED=1
    unset BACKUP_PASSPHRASE GH_TOKEN
    for path in "$pass" "$run_meta" "$artifact_meta" "$artifact_zip"; do
      case "$path" in
        "$RUNNER_TEMP"/l1b-b2-passphrase|"$RUNNER_TEMP"/l1b-b1-run.json|"$RUNNER_TEMP"/l1b-b1-artifact.json|"$RUNNER_TEMP"/l1b-b1-artifact.zip)
          rm -f -- "$path" >/dev/null 2>&1 || cleanup_rc=1
          [[ ! -e "$path" && ! -L "$path" ]] || cleanup_rc=1
          ;;
        *) cleanup_rc=1 ;;
      esac
    done
    case "$artifact_dir" in
      "$RUNNER_TEMP"/l1b-b2-artifact)
        rm -rf -- "$artifact_dir" >/dev/null 2>&1 || cleanup_rc=1
        [[ ! -e "$artifact_dir" && ! -L "$artifact_dir" ]] || cleanup_rc=1
        ;;
      *) cleanup_rc=1 ;;
    esac
    return "$cleanup_rc"
  }
  cleanup_entrypoint_on_exit() {
    local rc=$?
    trap - EXIT ERR
    if ! cleanup_entrypoint; then
      printf '::error::L1B_B2_ENTRYPOINT_CLEANUP_FAILED
' >&2
      exit 96
    fi
    exit "$rc"
  }
  trap cleanup_entrypoint_on_exit EXIT

  printf '%s' "$BACKUP_PASSPHRASE" > "$pass"
  chmod 600 "$pass"
  unset BACKUP_PASSPHRASE
  gh api "/repos/$GITHUB_REPOSITORY/actions/runs/$EXPECTED_BACKUP_RUN_ID" > "$run_meta"
  python3 - "$run_meta" <<'PY'
import json,os,pathlib,sys
d=json.loads(pathlib.Path(sys.argv[1]).read_text()); e={'id':int(os.environ['EXPECTED_BACKUP_RUN_ID']),'head_branch':os.environ['EXPECTED_BACKUP_HEAD_REF'],'head_sha':os.environ['EXPECTED_SOURCE_SHA'],'conclusion':'success'}
for k,v in e.items():
    if d.get(k)!=v: raise SystemExit(f'B-1 run metadata mismatch: {k}')
if d.get('repository',{}).get('id')!=int(os.environ['EXPECTED_REPOSITORY_ID']): raise SystemExit('B-1 repository identity mismatch')
PY
  gh api "/repos/$GITHUB_REPOSITORY/actions/artifacts/$EXPECTED_ARTIFACT_ID" > "$artifact_meta"
  checker="$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore-check.py"
  python3 "$checker" metadata "$artifact_meta"
  gh api "/repos/$GITHUB_REPOSITORY/actions/artifacts/$EXPECTED_ARTIFACT_ID/zip" > "$artifact_zip"
  [[ "$(stat -c '%s' "$artifact_zip")" == "$EXPECTED_ARTIFACT_ZIP_BYTES" ]]
  [[ "$(sha256sum "$artifact_zip"|awk '{print $1}')" == "$EXPECTED_ARTIFACT_ZIP_SHA256" ]]
  python3 "$checker" artifact "$artifact_zip" "$artifact_dir"
  unset GH_TOKEN
  export ARTIFACT_DIR="$artifact_dir" BACKUP_PASSPHRASE_FILE="$pass"
  child_rc=0
  bash "$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore.sh" --run || child_rc=$?
  if [[ "$child_rc" != 0 ]]; then exit "$child_rc"; fi
  trap - EXIT ERR
  if ! cleanup_entrypoint; then
    printf '::error::L1B_B2_ENTRYPOINT_CLEANUP_FAILED
' >&2
    exit 96
  fi
  printf 'L1B_B2_ENTRYPOINT_CLEANUP_COMPLETE
'
  exit 0
fi
if [[ "${1:-}" == --selftest && "${BASH_SOURCE[0]}" == "$0" ]]; then
  [[ "${#L1B_B2_ALLOWED_STAGES[@]}" == 15 ]]
  for s in "${L1B_B2_ALLOWED_STAGES[@]}"; do l1b_b2_stage_allowed "$s"; done
  if l1b_b2_stage_allowed tampered-stage; then exit 1; fi
  t="$(mktemp -d)"; trap 'rm -rf -- "$t"' EXIT
  printf 'AICC\t463\t5c4bfc371fe4e62e62c03c119d87b21e\nL0B\t234\t4c19c28fb80c806e01b5200b1e84edb4\nLINE\t127\te0977efa7ccc1f340e753fe470d19da2\n' > "$t/a"
  printf 'AICC_REL\t32\t77920aa928188c3c5ad5cd6663299fe9\nAICC_COL\t166\t7bfa00c87f46152bc58b797f344d1e37\nAICC_POL\t14\t29ba83e72a1444f0f340b644658bf59b\nAICC_FUN\t6\t4a448ec93b102ce47d18818599707916\nAICC_GRANT\t245\t8d2ed0d66cd81c70d7c45dbc6620237a\n' >> "$t/a"
  for scope in L0B LINE; do for kind in REL COL POL FUN GRANT; do printf '%s_%s\t1\t11111111111111111111111111111111\n' "$scope" "$kind"; done; done >> "$t/a"
  printf '60\t96034c21cbd679dccb46eb2b8b2bf328\n' > "$t/b"
  printf '0\n' > "$t/c"
  printf 'L0B\t26\t11111111111111111111111111111111\nLINE\t11\t11111111111111111111111111111111\n' > "$t/index"
  printf 'AICC_CONSTRAINT\t24\t2532413a689e46fc350d77137984bbc7\nAICC_FUNCDEF\t6\ta0d2dde4e49c7c15bb2b04c7b2a2ba56\nAICC_INDEX\t22\t6ac0cbd6f5b79519165e2a8a453f176f\nAICC_TRIGGER\t9\te6d867e6658d53c68a542ab6f22b920a\nL0B_CONSTRAINT\t77\t694de6dfa636f3dc11931b016e83d77f\nL0B_FUNCDEF\t31\t5c554bfe5a9a27a7f3549c2e88d630dc\nL0B_INDEX\t26\t587e7bf78ebb0993165f5b0db3814182\nL0B_TRIGGER\t5\t6e059025771f56da66f5303b050a770d\nLINE_CONSTRAINT\t22\t15d1af279461fc0cda1799bb3be5cadc\nLINE_FUNCDEF\t0\td41d8cd98f00b204e9800998ecf8427e\nLINE_INDEX\t11\t0ecfcc5ee8b470ec5c47b1172c1bd1ec\nLINE_TRIGGER\t0\td41d8cd98f00b204e9800998ecf8427e\n' > "$t/schema-semantics"
  printf 'AICC\t305\t11111111111111111111111111111111\nL0B\t115\t11111111111111111111111111111111\nLINE\t77\t11111111111111111111111111111111\n' > "$t/raw-acl"
  printf 'AICC_RELMETA\t32\t11111111111111111111111111111111\nAICC_RELACL\t200\t11111111111111111111111111111111\nAICC_COLACL\t20\t11111111111111111111111111111111\nAICC_FUNMETA\t6\t11111111111111111111111111111111\nAICC_FUNACL\t47\t11111111111111111111111111111111\n' >> "$t/raw-acl"
  for scope in L0B LINE; do
    for kind in RELMETA RELACL COLACL FUNMETA FUNACL; do
      printf '%s_%s\t1\t11111111111111111111111111111111\n' "$scope" "$kind"
    done
  done >> "$t/raw-acl"
  printf 'AICC\t1455\t11111111111111111111111111111111\nL0B\t1917\t11111111111111111111111111111111\nLINE\t588\t11111111111111111111111111111111\nRUNTIME\t15\t11111111111111111111111111111111\n' > "$t/effective"
  printf 'ROLE_GRAPH\t3\t11111111111111111111111111111111\n' > "$t/role-graph"
  l1b_b2_validate_triplet_file index "$t/index"
  l1b_b2_validate_triplet_file schema-semantics "$t/schema-semantics"
  l1b_b2_assert_triplet schema-semantics AICC_FUNCDEF "$EXPECTED_AICC_FUNCDEF_PARTS" "$EXPECTED_AICC_FUNCDEF_FINGERPRINT" "$t/schema-semantics"
  l1b_b2_assert_triplet schema-semantics AICC_INDEX "$EXPECTED_AICC_INDEX_PARTS" "$EXPECTED_AICC_INDEX_FINGERPRINT" "$t/schema-semantics"
  l1b_b2_assert_triplet schema-semantics L0B_TRIGGER "$EXPECTED_L0B_TRIGGER_PARTS" "$EXPECTED_L0B_TRIGGER_FINGERPRINT" "$t/schema-semantics"
  l1b_b2_assert_triplet schema-semantics LINE_CONSTRAINT "$EXPECTED_LINE_CONSTRAINT_PARTS" "$EXPECTED_LINE_CONSTRAINT_FINGERPRINT" "$t/schema-semantics"
  l1b_b2_validate_triplet_file raw-acl "$t/raw-acl"
  l1b_b2_validate_triplet_file effective-privilege "$t/effective"
  l1b_b2_validate_triplet_file role-graph "$t/role-graph"
  [[ "$EXPECTED_AICC_PRODUCTION_FINGERPRINT" == 4ef839fd8a717501ab3861c1e5aa3a52 ]]
  l1b_b2_assert_triplet catalog AICC_REL "$EXPECTED_AICC_REL_PARTS" "$EXPECTED_AICC_REL_FINGERPRINT" "$t/a"
  l1b_b2_assert_triplet catalog AICC_COL "$EXPECTED_AICC_COL_PARTS" "$EXPECTED_AICC_COL_FINGERPRINT" "$t/a"
  l1b_b2_assert_triplet catalog AICC_POL "$EXPECTED_AICC_POL_PARTS" "$EXPECTED_AICC_POL_FINGERPRINT" "$t/a"
  l1b_b2_assert_triplet catalog AICC_FUN "$EXPECTED_AICC_FUN_PARTS" "$EXPECTED_AICC_FUN_FINGERPRINT" "$t/a"
  diag="$(l1b_b2_emit_catalog_diagnostics AICC "$t/a" 2>&1)"
  [[ "$(wc -l <<< "$diag")" == 5 ]]
  grep -Fxq '::notice::L1B_B2_CATALOG_DIAGNOSTIC scope=AICC kind=REL parts=32 digest=77920aa928188c3c5ad5cd6663299fe9' <<< "$diag"
  grep -Fxq '::notice::L1B_B2_CATALOG_DIAGNOSTIC scope=AICC kind=GRANT parts=245 digest=8d2ed0d66cd81c70d7c45dbc6620237a' <<< "$diag"
  if mismatch="$(l1b_b2_assert_catalog AICC 464 5c4bfc371fe4e62e62c03c119d87b21e "$t/a" 2>&1)"; then exit 1; fi
  [[ "$(wc -l <<< "$mismatch")" == 6 ]]
  grep -Fxq '::error::L1B_B2_FINGERPRINT_MISMATCH stage=catalog scope=AICC expected_parts=464 expected_digest=5c4bfc371fe4e62e62c03c119d87b21e actual_parts=463 actual_digest=5c4bfc371fe4e62e62c03c119d87b21e' <<< "$mismatch"
  grep -Fxq '::notice::L1B_B2_CATALOG_DIAGNOSTIC scope=AICC kind=COL parts=166 digest=7bfa00c87f46152bc58b797f344d1e37' <<< "$mismatch"
  raw_diag="$(l1b_b2_emit_raw_acl_diagnostics AICC "$t/raw-acl" 2>&1)"
  [[ "$(wc -l <<< "$raw_diag")" == 5 ]]
  grep -Fxq '::notice::L1B_B2_RAW_ACL_DIAGNOSTIC scope=AICC kind=FUNACL parts=47 digest=11111111111111111111111111111111' <<< "$raw_diag"
  grant_diag="$(l1b_b2_emit_catalog_grant_diagnostic AICC "$t/a" 2>&1)"
  [[ "$grant_diag" == '::notice::L1B_B2_CATALOG_GRANT_DIAGNOSTIC scope=AICC kind=GRANT parts=245 digest=8d2ed0d66cd81c70d7c45dbc6620237a' ]]
  for kind in RELACL COLACL FUNACL; do
    case "$kind" in RELACL) actual=194;; COLACL) actual=14;; FUNACL) actual=41;; esac
    awk -F '\t' -v kind="AICC_$kind" 'BEGIN{OFS="\t"} $1=="AICC"{$2=299;$3="8036afaa87de193d3ce344886499efb6"} $1==kind{$2-=6;$3="22222222222222222222222222222222"} {print}' "$t/raw-acl" > "$t/raw-$kind"
    if raw_mismatch="$(l1b_b2_assert_raw_acl AICC 305 e2aeb59ccf1b7cf4fd3d32799d1e91c6 "$t/raw-$kind" "$t/a" 2>&1)"; then exit 1; fi
    [[ "$(wc -l <<< "$raw_mismatch")" == 7 ]]
    grep -Fxq '::error::L1B_B2_FINGERPRINT_MISMATCH stage=raw-acl scope=AICC expected_parts=305 expected_digest=e2aeb59ccf1b7cf4fd3d32799d1e91c6 actual_parts=299 actual_digest=8036afaa87de193d3ce344886499efb6' <<< "$raw_mismatch"
    grep -Fxq "::notice::L1B_B2_RAW_ACL_DIAGNOSTIC scope=AICC kind=$kind parts=$actual digest=22222222222222222222222222222222" <<< "$raw_mismatch"
    grep -Fxq '::notice::L1B_B2_CATALOG_GRANT_DIAGNOSTIC scope=AICC kind=GRANT parts=245 digest=8d2ed0d66cd81c70d7c45dbc6620237a' <<< "$raw_mismatch"
  done
  l1b_b2_assert_pair all-function-acl ALL_FUNCTION_ACL 60 96034c21cbd679dccb46eb2b8b2bf328 "$t/b"
  printf '10\tfb000e29b0a4c3aacd97a6e3a8f96766\n' > "$t/auth-fk"
  l1b_b2_assert_pair auth-fk-fingerprint AUTH_FK 10 fb000e29b0a4c3aacd97a6e3a8f96766 "$t/auth-fk"
  l1b_b2_assert_zero private-storage MTP_PRIVATE_OBJECTS "$t/c"
  if l1b_b2_assert_triplet catalog AICC 464 5c4bfc371fe4e62e62c03c119d87b21e "$t/a" >/dev/null 2>&1; then exit 1; fi
  cp "$t/a" "$t/bad"; printf 'AICC_REL\t8\tprivate-table-name\n' >> "$t/bad"
  if l1b_b2_emit_catalog_diagnostics AICC "$t/bad" >/dev/null 2>&1; then exit 1; fi
  cp "$t/a" "$t/stray"; printf 'STRAY\t1\t11111111111111111111111111111111\n' >> "$t/stray"
  if l1b_b2_assert_catalog AICC 463 5c4bfc371fe4e62e62c03c119d87b21e "$t/stray" >/dev/null 2>&1; then exit 1; fi
  awk 'NR==1{$0=$0 "\textra"} {print}' "$t/a" > "$t/fourth"
  if l1b_b2_assert_catalog AICC 463 5c4bfc371fe4e62e62c03c119d87b21e "$t/fourth" >/dev/null 2>&1; then exit 1; fi
  head -n 17 "$t/a" > "$t/missing"
  if invalid_shape="$(l1b_b2_emit_catalog_diagnostics AICC "$t/missing" 2>&1)"; then exit 1; fi
  [[ "$invalid_shape" == '::error::L1B_B2_FINGERPRINT_FILE_INVALID stage=catalog' ]]
  ln -s "$t/a" "$t/link"
  if l1b_b2_emit_catalog_diagnostics AICC "$t/link" >/dev/null 2>&1; then exit 1; fi
  head -n 17 "$t/raw-acl" > "$t/raw-missing"
  if raw_invalid="$(l1b_b2_emit_raw_acl_diagnostics AICC "$t/raw-missing" 2>&1)"; then exit 1; fi
  [[ "$raw_invalid" == '::error::L1B_B2_FINGERPRINT_FILE_INVALID stage=raw-acl' ]]
  python3 - "${BASH_SOURCE[0]}" <<'PY'
from pathlib import Path
import sys
payload=Path(sys.argv[1]).read_text(encoding='utf-8')
trap_start=payload.index('l1b_b2_failure_trap(){')
trap_end=payload.index('; trap l1b_b2_failure_trap ERR',trap_start)
failure_trap=payload[trap_start:trap_end]
for forbidden in ('source=%s','line=%s','rc=%s','BASH_SOURCE','BASH_LINENO'):
    if forbidden in failure_trap:
        raise SystemExit(f'failure telemetry leaks non-allowlisted field: {forbidden}')
if "L1B_B2_SAFE_FAILURE stage=%s\\n" not in failure_trap:
    raise SystemExit('allowlisted stage-only failure marker is absent')
if "L1B_B2_SAFE_FAILURE\\n" not in failure_trap:
    raise SystemExit('constant pre-stage failure marker is absent')
execute=payload[payload.index('if [[ "${1:-}" == --execute') : payload.index('if [[ "${1:-}" == --selftest')]
required=(
    'trap cleanup_entrypoint_on_exit EXIT',
    'printf \'%s\' "$BACKUP_PASSPHRASE" > "$pass"',
    '"$RUNNER_TEMP"/l1b-b1-run.json',
    '"$RUNNER_TEMP"/l1b-b1-artifact.json',
    '"$RUNNER_TEMP"/l1b-b1-artifact.zip',
    '"$RUNNER_TEMP"/l1b-b2-artifact',
    'bash "$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore.sh" --run || child_rc=$?',
    'trap - EXIT ERR',
    'if ! cleanup_entrypoint; then',
    'L1B_B2_ENTRYPOINT_CLEANUP_COMPLETE',
)
for token in required:
    if token not in execute:
        raise SystemExit(f'missing entrypoint cleanup/source token: {token}')
if execute.index('trap cleanup_entrypoint_on_exit EXIT') > execute.index('printf \'%s\' "$BACKUP_PASSPHRASE" > "$pass"'):
    raise SystemExit('cleanup trap is installed after passphrase materialization')
if execute.index('if ! cleanup_entrypoint; then') > execute.index('L1B_B2_ENTRYPOINT_CLEANUP_COMPLETE'):
    raise SystemExit('entrypoint completion precedes explicit cleanup')
recovery_marker='L1B fresh post-import B-2 isolated restore:'+' PASS'
if recovery_marker in execute:
    raise SystemExit('entrypoint emits recovery PASS before workflow cleanup verification')
if 'exec bash "$GITHUB_WORKSPACE/ops/l1b-post-import-isolated-restore.sh"' in execute:
    raise SystemExit('entrypoint exec would bypass its EXIT cleanup')
PY
  echo 'L1B B-2 privacy-safe telemetry selftest: PASS'
  exit 0
fi