-- Backwards-compatible LINE snapshot v2 activation.
--
-- Version 2 adds only user-approved, sanitised subtask text/done state and
-- HTTPS attachment-link metadata. Existing version 1 rows and clients remain
-- valid during the staged rollout. No planner data is rewritten.

alter table public.mtp_line_snapshots
  drop constraint if exists mtp_line_snapshots_schema_version_check;

alter table public.mtp_line_snapshots
  add constraint mtp_line_snapshots_schema_version_check
  check (schema_version in (1, 2))
  not valid;

alter table public.mtp_line_snapshots
  validate constraint mtp_line_snapshots_schema_version_check;
