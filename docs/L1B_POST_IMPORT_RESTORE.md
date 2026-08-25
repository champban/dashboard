# L1B Post-Import B-2 Restore Packet

Status: **STDIN + ONE-SHOT REMEDIATED / FINAL REQUALIFICATION REQUIRED / DO NOT MERGE**

## Exact boundary

- Base: `main@297854c09205097a6a58cbce4c64961c802cd7a3`
- Base tree: `c25d9b044e7a46963c3fc5661bd53b08f48d83d6`
- Branch: `ops/l1b-post-import-isolated-restore`
- Required history: exactly one commit from the exact base
- Changed files: exactly eleven additions
- Scope: Q-L1B-002 isolated recovery evidence and fail-closed remediation only

## Fresh post-import B-1

- source/run/jobs: `c8514e0619ccc13c48c96a6e9e7d334aded5ce11` / `32796123583` / `97696797923` + `97696822338`
- artifact `9550594832`: `dashboard-l1b-post-import-backup-20260825T053448Z`
- created/expires: `2026-08-25T05:35:58Z` / `2026-08-26T05:35:57Z`
- ZIP `56351` bytes / `385fb4bde21e9eaa844096d83ee2a334e4586ed5da2072cbe000b4b52b709754`
- encrypted archive `54954` bytes / `23c10887ee163dc5b5528211953da36de9b0c9b47d077ace9a3faf72331fc27b`
- roles/schema/data SHA-256: `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` / `645e07100834b1e50da3baeeddd9a9a56c59474620a0ec1864d94bfe5ae7a46e` / `f548dff0c898a2fe86ee431eba407d5af8d25ac9e33b3584960726fb778e9e27`
- Supabase CLI `2.111.0`; decrypt/hash verification **PASS**
- Owner custody of a separately downloaded encrypted copy: **CONFIRMED**

## Attempt 1 — fail-closed evidence

- workflow run `32841653681`
- source-safety job `97782282971`: **PASS**
- isolated restore job `97782323673`: **FAIL-CLOSED**
- exact source `324da1a5036b01f0e5bc1d1ac892d9c277041635`
- artifact validation, pinned tooling, network-isolated PostgreSQL 17 startup, decryption and logical restore reached the first post-restore SQL reconciliation command
- passphrase cleanup: **PASS**
- plaintext/output artifact: **NONE**
- Production connection/write: **NONE**
- post-failure Production invariance: migration tail `20260823055451_l0b_data_foundation`; planner `105/17/6/15/0`; LINE `1/5/1/17/1`; L1/private Storage absent

Attempt 1 is not recovery PASS and does not prove a restored-data mismatch.

## Confirmed root causes and preventive controls

### P1 — closed stdin on heredoc-backed Docker exec

Independent review proved every heredoc-backed `docker exec` needed
`--interactive` to keep stdin open for `psql`. The omission affected count, catalog,
index, raw ACL, effective privilege, role graph, AICC count and FK SQL.

Pinned helper `00bfe97899918ff8af5357c5dc2483819394dbd7` now detects only
heredoc-backed exec blocks, inserts `--interactive` only when absent, audits for zero
remaining omissions, rewrites the review checker to invoke the exact patched base-ACL
checker, and provides positive/negative selftests.

Frozen evidence:

- core/base-ACL/review fixes `3/2/5`
- stdin-safe core `fcd181886d4733ca4376faca75dfc2725ddcd065`
- stdin-safe base ACL `44456c741980bfa1752d23abeb3590417de18e15`
- stdin-safe review `9639cc7c08cc3d7447b775dab5e634973b52cdca`
- final count/review-remediated core `e830585d50ad0f795fe72a8fba9300416bac58ac`

### P2 — rerun could reuse the consumed labeled event

GitHub may rerun failed jobs using the original `labeled` event payload even after the
label is removed. Final workflow therefore requires `github.run_attempt == 1` in the
job-level condition, reasserts `${{ github.run_attempt }} == 1` before any artifact or
secret step, and source-safety requires the one-shot token. A rerun attempt skips the
restore job and cannot reuse the consumed approval event.

## Exact final source pins

- workflow `e99a1bea35d45b2f21a76e5f9cbb30fdafa91ba6`
- evidence document: this file
- original base ACL verifier `457d4ffa2543557e2c2e9488a0518a1f1881ea48`
- count/review injector `3a0bb3c49428b61ce6536c92f21f8a67ac633c34`
- AICC COPY/count verifier `33fb7d4c1f4330e499cd426470bb9fb68ff1d4e2`
- artifact/checker `879cdbf77c68d35a3d7512059e828742f9f50e35`
- original restore core `90757c51f83e10545df8159b0bd3757c223144da`
- SQL-side exact-count verifier `39acfa0b950c5ec9365f46623d416d4cbc882e52`
- original comprehensive review checker `bf00f2503db6561359f19dfbaf1d39b5f9bcb7b1`
- stdin patcher `00bfe97899918ff8af5357c5dc2483819394dbd7`
- final wrapper `e77864ae9b73fd3d914fe891eccde6d66ed7862d`
- immutable PostgreSQL image `supabase/postgres@sha256:ca7871b587ca2c401ac0f325df6249c9aa0d25647ded34631158efc51176767f`

## Recovery verification coverage

The exact source verifies exact artifact pins; network isolation before decryption;
transactional roles/schema/data restore; exact Auth/LINE/L0b and eight-table AICC count
reconciliation; accepted planner aggregates; catalog/index/RLS/policies/raw ACL/default
ACL; effective runtime privileges and complete role graph; all `57` public application
foreign keys; owner integrity; L1/private Storage absence; exact stdin transport for all
ten heredoc-backed Docker commands; one-shot event consumption; and early plus
unconditional passphrase cleanup.

## Final gates before one replacement attempt

- exact-head normal CI and source-safety must PASS;
- fresh independent review must close P1/P2 and report no blocking finding;
- artifact/base/Production baseline and Environment/reviewer controls must remain exact;
- approval label must be absent, then one new exact `owner-approved-b2-restore` event may be created;
- stop on any source, base, artifact, target or evidence drift.

The replacement attempt grants no merge, Production apply, Storage, activation,
reconciliation or cleanup authority. A failed run cannot be rerun; it requires a new
exact-head qualification and new label event.

## Hard stop

**DO NOT MERGE. DO NOT APPLY OR ACTIVATE.** No Production SQL, migration-history
write, Storage creation, Auth/RLS/provider change, import/reconciliation, client
activation, Drive demotion, cleanup/deletion or L1C cutover is authorized.
