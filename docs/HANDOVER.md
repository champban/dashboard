# HANDOVER — My Todo Planner (champban/dashboard)

## What this project is
- React SPA in `src/App.jsx` (~14k บรรทัด) → build เป็น **`index.html` ไฟล์เดียว** เสิร์ฟด้วย GitHub Pages
- `index.html` และ `BUILD-MANIFEST.json` เป็นไฟล์ **generated — ห้ามแก้มือเด็ดขาด** แก้ที่ source แล้วรัน pipeline
- อ่าน `PROJECT_CONTEXT.md` ก่อนเริ่ม เป็นเอกสารสถาปัตยกรรม/กฎ/ประวัติการตัดสินใจตัวจริง

## Working agreement
- ตอบเป็นภาษาไทย สั้น ทีละขั้น แนบลิงก์ · screenshot วงแดง = bug report
- **ห้าม merge PR เองโดยไม่ได้รับอนุญาตชัดเจน** · **ห้ามเปิด PR เองถ้าไม่ได้สั่ง**
- develop บน branch `claude/dashboard-v3-77-0-restore-48n644` (ถ้า PR ของมัน merge แล้ว ให้ restart จาก `main` ล่าสุด ชื่อเดิม)
- ห้าม rewrite history ของ `main`

## Build / test (รันทุกครั้ง ตามลำดับ)
- `npm ci` → `npm run verify` → `npm test`
- เกณฑ์ผ่าน: harness **LEN 25129 / NODES 141** เท่าเดิม · `audit.py` **blockers=0 warnings=3** · packager **6/6 CSP PASS**
- es2019 guard: `grep -c '??' index.html` และ `grep -c '?\.\[' index.html` ต้องได้ **0 ทั้งคู่**
- `index.html` ต้อง byte-identical เมื่อรัน verify สองครั้ง
- ตอนนี้มี **124 assertions / 8 ไฟล์** ใน `build/*.test.mjs` (ต่อท้าย `package.json :: scripts.test`)

## Current state
- **PR #38 เปิดอยู่ CI เขียว รอ user กด merge** — https://github.com/champban/dashboard/pull/38
- มี 3 commits: date-picker fix, Check now + 10s poll, sync verdict + header Save button
- deploy แล้วถึง 3.79 (PR #35–37 merge ไปแล้ว)

## Key architecture (รายละเอียดใน PROJECT_CONTEXT.md)
- Google Drive sync: `src/App.jsx :: gsyncNow()` (reconciler, auto-sync/focus), `gsyncSaveNow()` (ปุ่ม Save), `gsyncCheckNow()` (ปุ่ม Check now)
- **"มีอะไรยังไม่ขึ้น cloud?" อ่านจาก `localUnsynced()`** ซึ่งเทียบ `dataFingerprint()` กับ `gsync.lastPushedFp` — **ห้ามกลับไปเทียบ timestamp** (`dataLastUpdated` ขยับเฉพาะที่มีคนเรียก setter ทางที่ลืมเรียกจะมองไม่เห็น และทำให้ไม่ upload)
- `COMPARED_KEYS` คือ subset ที่ใช้เทียบ ตัด `savedAt`/`dataLastUpdated`/`appVersion`/`profile`/`activity`/`tabReads` ออก ถ้าใส่กลับไป "matched" จะเป็นไปไม่ได้เลย
- conflict: ข้างที่แพ้ถูก upload เป็น conflicted copy **ก่อน** ทำลาย (`saveConflictCopy()`) — ถ้าเขียนไม่สำเร็จต้องยกเลิกการทำลาย ลำดับนี้คือทั้งหมดของ feature
- cloud เปลี่ยนแต่ local ไม่มีอะไรค้าง → **apply เองไม่ถาม** (3.78) · ต่างกันสองฝ่าย → dialog
- date fields ทั้ง 16 ที่ใช้ `DateInput()` — native date input เป็น tap target เอง (44px) ห้ามกลับไปใส่ `pointerEvents:"none"`

## Testing discipline (โดนมาแล้วทุกข้อ)
- assertion ที่ค้นจาก `document.body.textContent` **ไม่เชื่อถือได้** — มันรวมเนื้อใน `<style>`/`<script>` และ bundle มี string ของ UI อยู่ครบ
- `elementFromPoint` คืน `null` ถ้าจุดอยู่นอก viewport → อ่านได้เป็น "ไม่มีอะไรทับ" ต้อง scroll เข้ามาก่อน
- ถ้า query ไม่เจอ element เลย assertion อื่นจะผ่านทั้งหมดโดยไม่ได้เช็คอะไร → ต้อง assert ว่าเจอของก่อน
- เขียน test ใหม่แล้วต้อง **รันกับโค้ดเก่าให้เห็นว่ามัน FAIL** ไม่งั้นไม่รู้ว่ามันกัดจริง
- jsdom วัด layout ไม่ได้ ใช้ Chromium ที่ `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` + `playwright-core` (ติดตั้งใน scratchpad ไม่ commit) เสิร์ฟด้วย `python3 -m http.server` แล้วลบ `body.className` + `#mtp-auth-screen` เพื่อข้าม Supabase gate

## Security
- **ห้ามใส่ API key ลง source** ทุกอย่างใน `index.html` เปิดอ่านได้ (static บน GitHub Pages) — repo นี้เคยหลุด 3 ตัว จัดการครบแล้ว
- Google Cloud project `369687041884` ตอนนี้มี API key **0 ตัว** · แอปใช้แค่ OAuth Client ID (`src/App.jsx :: GDRIVE_CLIENT_ID`) ซึ่งเปิดเผยได้ตามการออกแบบ **ห้ามลบ**

## Pending / next steps
1. รอ user merge PR #38 → แล้วส่ง checklist เช็คบน iPhone (มี 7 ข้ออยู่ท้าย PR body)
2. ลบ remote branch เก่า 10 อัน: `ci/secret-scan`, `fix/sync-time-visible`, `fix/save-to-cloud-actually-pushes`, `feat/three-data-locations`, `deliver/three-data-locations`, `fix/save-means-save`, `fix/cloud-change-applies-itself`, `codex/*` 3 อัน — **ห้ามลบ `claude/first-time-user-guide-lupsqy`** (user สั่งเก็บ มีไฟล์ ~60 ไฟล์ที่ไม่มีใน main)
3. AI chat (Claude + ChatGPT) — ยังไม่เริ่ม แผน: Supabase Edge Function ถือ key ใน secrets, gate ด้วย JWT เดิม; โดเมน `qjaywadzvwvcspdsjxth.supabase.co` อยู่ใน `connect-src` แล้ว **ไม่ต้องแก้ CSP** ต้องถาม user ก่อนว่า chat จะเห็น task ไหม + quota ต่อ user + วาง UI ที่ไหน
4. Optional: เปิด "Automatically delete head branches" ใน repo Settings

## Known bugs — พิสูจน์แล้วว่ามีมาก่อน ยังไม่แก้ (คนละ scope)
- banner บนสุดสองอันทับกัน: "Back up now" × "💾 Save Now" (เกิดเมื่อโชว์พร้อมกัน)
- ปุ่ม ⛶ Full screen `src/App.jsx` z-index 9999 สูงกว่า modal ทุกตัว วาดทับ**ข้อความ** dialog (ไม่ทับปุ่ม) — แก้ต้องกวาด modal ทั้งแอป
