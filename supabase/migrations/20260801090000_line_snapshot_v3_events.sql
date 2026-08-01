-- Snapshot v3 adds privacy-minimised calendar events for deterministic LINE
-- search by month, ISO week, and year. Existing v1/v2 rows remain readable.
alter table public.mtp_line_snapshots
  drop constraint if exists mtp_line_snapshots_schema_version_check;

alter table public.mtp_line_snapshots
  add constraint mtp_line_snapshots_schema_version_check
  check (schema_version in (1, 2, 3)) not valid;

alter table public.mtp_line_snapshots
  validate constraint mtp_line_snapshots_schema_version_check;
