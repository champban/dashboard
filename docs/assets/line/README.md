# LINE Rich Menu assets

Versioned backup of the persistent LINE Rich Menu for the `My APP` Official
Account (`@103rexjo`). These files exist so the menu can be recreated exactly if
it is deleted from LINE Official Account Manager — that console is the only
place the live menu is defined, and it has no version history of its own.

**Never overwrite a version in place.** A changed design is `-v2`, not an edit to
`-v1`. Callers and this document both refer to versions by filename.

## Files

| File | What it is | Status |
|---|---|---|
| `line-rich-menu-menu-v1.json` | Rich Menu configuration sent to the Messaging API | Committed |
| `line-rich-menu-menu-v1.png` | Final deployment image — the composed menu, 2500 × 843 px, ~419 KB | **See "Missing binary" below** |
| `line-rich-menu-background-v1.png` | Background plate without the `Menu` label | Not supplied |

## Missing binary

`line-rich-menu-menu-v1.png` is the image currently live in LINE Official
Account Manager. It was produced in an earlier session on the owner's machine
and has never been committed. It must be uploaded as the **original bytes** —
a re-encoded copy is a different image and defeats the purpose of this backup.

Until it is committed, the Rich Menu is recoverable in *configuration* only, not
in *appearance*. Treat that as an open gap, not a finished backup.

`line-rich-menu-background-v1.png` is optional; it only matters if the label
text ever needs re-typesetting over the same artwork.

## Specification

Recorded here so the menu can be rebuilt from scratch if every image is lost.

| Property | Value |
|---|---|
| Canvas | 2500 × 843 px |
| Format | PNG |
| Clickable areas | One, full width and height |
| Visible button label | `Menu` |
| Chat bar text | `Menu` |
| Action type | Text / Message |
| Exact text sent | `menu` (lowercase, no trailing space) |
| Default display | Show |
| Theme | Todo Planner — Thailand Travelling Theme |

The `menu` text is what makes this work: `parseIntent()` in
`supabase/functions/line-todo-webhook/logic.js` matches `/^(?:เมนู|menu)$/u` and
replies with the English Flex command menu, which contains the `Search` button.
Changing the text sent by the Rich Menu without changing that regex silently
breaks the button — it becomes an unrecognised command and returns help text.

## How the live menu was created

Manually, through LINE Official Account Manager — not through the Messaging API.

**A Manager-created Rich Menu may not appear in the Messaging API's Rich Menu
list endpoint.** An empty list from `GET /v2/bot/richmenu/list` is therefore not
evidence that the menu is missing. Verify in the LINE app instead, using the
owner acceptance steps in `docs/LINE_OFFICIAL_SETUP.md`.

## Recreating from these files

Requires a LINE Channel Access Token. **Do not paste the token into chat, a
commit, a log, or this repository** — pass it through the environment of the
shell that runs the commands, and only for as long as the commands run.

```sh
# 1. Create the menu from the committed configuration; returns a richMenuId
curl -s -X POST https://api.line.me/v2/bot/richmenu \
  -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @docs/assets/line/line-rich-menu-menu-v1.json

# 2. Upload the image to that richMenuId
curl -s -X POST "https://api-data.line.me/v2/bot/richmenu/<richMenuId>/content" \
  -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" \
  -H "Content-Type: image/png" \
  --data-binary @docs/assets/line/line-rich-menu-menu-v1.png

# 3. Set it as the default menu for all users
curl -s -X POST "https://api.line.me/v2/bot/user/all/richmenu/<richMenuId>" \
  -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN"
```

Step 2 needs the PNG. See "Missing binary" above.

Creating a menu through the API does not delete the Manager-created one. If both
exist, the API-created default wins for users it is applied to. Confirm which
menu users actually see before assuming the recreation succeeded.

## Acceptance

Owner acceptance for any Rich Menu change is the seven-step checklist in
`docs/LINE_OFFICIAL_SETUP.md` → "Rich Menu". It ends at "the returned menu
contains `Search`", tested on both LINE mobile and LINE for PC.
