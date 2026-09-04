# L1B Promotion Artifact Apply Order

Status: **GENERATED FOR REVIEW ONLY / NO PRODUCTION AUTHORITY**

1. Targeted L1A database migration: `20260825011714_l1a_direct_todo.sql`
2. Stop and verify the exact L1A catalog/RLS/ACL/function shape.
3. Targeted L1B database migration: `20260825011716_l1b_planner_parity.sql`
4. Stop and verify the exact L1B catalog/RLS/ACL/function shape.
5. Separate private Storage operation: `supabase/operations/l1b_private_storage.sql`
6. Stop and verify bucket, MIME/size limits, owner-path policies, and zero unexpected objects.

The database units and Storage operation are separate gates. Do not claim
cross-operation atomicity. The published browser client must remain disabled.
Never use generic `supabase db push` for this project. The final Production
merge/apply remains reserved for one later exact Owner Critical-Gate decision.
