# LINE Official Setup

This runbook activates the read-only Todo Planner bot after the pull request is
approved. Never paste channel secrets or Supabase secret keys into chat, GitHub,
screenshots, or source files.

## Architecture

```text
Full / Mobile app
  └─ successful Google Drive sync
       └─ reduced task snapshot → Supabase (RLS)

LINE user
  └─ LINE Messaging API webhook
       └─ Supabase Edge Function
            ├─ verify raw-body HMAC
            ├─ resolve one-time account link
            └─ read snapshot → deterministic English/Thai Flex cards + menu
```

The function sends replies only. It does not push notifications, call an AI
model, or read Google Drive. Snapshot v2 can receive sanitised Subtask text/done
state and HTTPS attachment-link metadata only after the owner enables each
sharing option. It never receives notes, descriptions, local files, base64
data, or raw task/Subtask/attachment IDs. Its English-first Flex menu and task
cards work in LINE PC and mobile; Quick Replies are an additional mobile
convenience. The Search action opens the keyboard and pre-fills `search ` or
`ค้นหา ` on supported mobile clients, with a typed-command fallback for LINE
PC.

## 1. Back up before production changes

- Create/verify the Supabase project backup before applying the migration.
- Confirm this GitHub branch contains the migration and function source.
- Keep a supplementary Google Drive planner JSON recovery copy.

Supabase is the main store for Auth/LINE server state; GitHub is the main
code/schema backup and audit trail; Drive is the supplementary user recovery
copy.

## 2. Create the LINE channel

1. In LINE Official Account Manager, create the Official Account.
2. In LINE Developers Console, create or attach its Messaging API channel.
3. Issue a channel access token and note the channel secret in the provider
   consoles only.
4. In response settings, enable Webhook. Disable overlapping automatic responses
   if they would answer the same messages twice.

## 3. Apply Supabase resources

Review first:

```bash
supabase link --project-ref qjaywadzvwvcspdsjxth
supabase db push --dry-run
```

After owner approval and backup confirmation:

```bash
supabase db push
```

For the task-details release, confirm the dry run includes
`20260730031026_line_task_details_snapshot_v2.sql`. It only widens the accepted
snapshot version from v1 to v1/v2; it does not rewrite existing rows.

Set these values through Supabase Dashboard → Edge Functions → Secrets (or a
secure local CLI session):

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`

Supabase automatically provides `SUPABASE_SECRET_KEYS` as a JSON dictionary.
Confirm a `default` secret key exists under Settings → API Keys; do not create or
paste a custom `SUPABASE_*` secret. The function accepts the auto-provided legacy
`SUPABASE_SERVICE_ROLE_KEY` only as a compatibility fallback. Never expose
either backend key to the browser.

Deploy only after the migration is applied:

```bash
supabase functions deploy line-todo-webhook
```

The repository config sets `verify_jwt = false` because LINE does not send a
Supabase JWT. The function itself authenticates every request with LINE HMAC.

## 4. Configure and verify the webhook

Webhook URL:

```text
https://qjaywadzvwvcspdsjxth.supabase.co/functions/v1/line-todo-webhook
```

1. Paste the URL into LINE Developers Console.
2. Enable “Use webhook”.
3. Run LINE’s Verify action. Its empty `events` payload should return HTTP 200.
4. An unsigned or altered payload must return HTTP 401.

## 5. Owner acceptance test

1. Sign in to the deployed Todo Planner.
2. Open Sync → LINE Official. Enable `Share sanitised Subtasks with LINE` and
   `Share HTTPS attachment links with LINE`.
3. Press `Save to Cloud`; confirm the LINE snapshot time appears.
4. Query a task containing more than five Subtasks. Confirm the card shows
   done/total, five rows, and the remaining count.
5. Query a task containing HTTPS link, picture-link, and video-link
   attachments. Confirm all corresponding buttons open in LINE.
6. Confirm an HTTP link, a local file attachment, and base64 data do not appear.
7. Turn each sharing option off separately, save again, and confirm its data is
   absent from the next LINE result.
8. If the account is not linked, create a link code and send the displayed
   `เชื่อม MTP-XXXX-XXXX` command to the Official Account
   within 10 minutes.
9. Confirm the English command menu appears automatically, switch to Thai and
   back, then run every command listed in
   `docs/PROJECT_PERFORMANCE_KPI.md`.
10. Re-send the same link code; it must fail.
11. Alter a task locally but make Drive fail; LINE must continue showing the old
   snapshot.
12. Make LINE/Supabase snapshot publishing fail; the Drive save must remain
   successful and the app must show a secondary LINE warning.
13. Repeat the save and query from both Full and Mobile.

Do not include real secret values, LINE user IDs, task titles, or message bodies
in test evidence.

## Command-menu-only update

The bilingual menu release changes only `line-todo-webhook`. It does not require
a database migration, a new link code, a planner resave, or changes to Function
Secrets.

After pull-request approval, but only with separate production deploy approval:

```bash
supabase functions deploy line-todo-webhook
```

Verify `menu` on LINE PC and both `menu` / `เมนู` plus the Quick Reply row on
LINE iOS or Android. Roll back by deploying the previous reviewed function
commit; do not delete LINE account mappings or snapshots.

## Search-button-only update

This release changes only `line-todo-webhook`. It adds `Search` / `ค้นหา` to
the Flex menu and Quick Replies. It does not require a database migration, new
link code, planner resave, browser deployment, or Function Secret change.

After the reviewed pull request is merged and the production gate passes:

```bash
supabase functions deploy line-todo-webhook
```

Acceptance:

1. Send `menu`; tap `Search`; on LINE iOS/Android confirm the keyboard opens
   with `search ` already filled. Add a keyword and send it.
2. Send `เมนู`; tap `ค้นหา`; confirm `ค้นหา ` is filled and the Thai result is
   returned.
3. On LINE PC, tap Search and confirm the bot gives the typed-command example
   `search passport` or `ค้นหา พาสปอร์ต`.
4. Send bare `search` and bare `ค้นหา`; each must return the same prompt.
5. Confirm the result still uses existing read-only task cards and that no
   database, Drive, or planner data is changed.

Rollback by redeploying the prior ACTIVE function version. Do not change or
delete LINE mappings, snapshots, migrations, or secrets.

## Rollback

1. Disable “Use webhook” in LINE Developers Console.
2. Roll back the GitHub Pages application through the normal reviewed release
   process.
3. Redeploy the previous reviewed `line-todo-webhook` function.
4. Keep the v1/v2 compatibility constraint and database tables in place during
   incident review so old clients, account mappings, and evidence remain
   usable. Do not downgrade the constraint while a v2 client may still publish.
5. Rotate the LINE access token/channel secret or Supabase backend key if a
   credential may have been exposed.
