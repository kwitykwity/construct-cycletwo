# Task 8 — Shared Frontend Infrastructure Verification

**Owner:** Trevor **Status:** In Progress — blocking findings in Task 4 code, integration scope pending **Branch:** `trevor/task8-frontend-integration` (from `task4-hardening` @ `478b8032`) **Date:** 2026-09-21

Covers the Task 8 checks that do not depend on the Auth/RLS foundation. Authenticated-board checks remain blocked on Tasks 5 and 6.

---

## Passed

| Check | Result | How verified |
| --- | --- | --- |
| Formatter tests | 18/18 pass | `yarn vitest run excalidraw-app/utils/formatters.test.ts` |
| TypeScript | Pass | `yarn tsc -p tsconfig.json` (see setup note) |
| ESLint | Pass, 0 warnings | `eslint --max-warnings=0 --ext .js,.ts,.tsx .` |
| Window geometry on reopen | No persistence | localStorage removed; position/size are component state, so they reset when the window unmounts |
| Loading / error / empty states | Present | `components/states/`; `ErrorState` has `onRetry` + `retryCooldown` |
| Typing / click-to-focus in editor | Works | Browser test on localhost:3001 |

**Setup note:** `@supabase/supabase-js` was added in `excalidraw-app/package.json`. Run `yarn install` after pulling or TypeScript fails with `TS2307`.

---

## Findings

### 1. HIGH (security) — Notes can execute script in other users' browsers

Two independent problems in `excalidraw-app/components/NoteEditor/NoteEditor.tsx`:

**a. The paste sanitizer un-escapes text.** Text nodes are returned as raw `textContent` (line 58) and the result is inserted with `insertHTML` (line 182). Text that merely _displays_ as markup becomes live markup.

Reproduced by running the exact `sanitizeHtml` code under jsdom:

```
input  (clipboard HTML): <code>&lt;img src=x onerror=alert(document.domain)&gt;</code>
output (inserted):       <img src=x onerror=alert(document.domain)>
live <img onerror> after insert: true
```

Real-world trigger: copying a code snippet that shows HTML from any web page and pasting it into a note.

The sanitizer also parses with `document.createElement("div").innerHTML` (line 53). That element belongs to the live document, so images inside it can load and fire handlers during sanitizing. Use `DOMParser` or a `<template>` element instead.

**b. Stored note HTML is rendered without sanitizing.** The sync effect assigns `editorRef.current.innerHTML = value` (line 124). Sanitizing happens only on paste, so anything that reaches the database another way — for example, a board member writing a note row directly through the Supabase API with their own token — is rendered as raw HTML for every viewer.

**Impact:** Team Notes are shown to other board members, so a single note can run script in teammates' browsers, where their Supabase session is stored. This is a cross-user security issue under the PRD's privacy requirements.

**Suggested fix (for the Task 4 author):**

- Escape text nodes in the sanitizer instead of returning raw `textContent`.
- Parse with `DOMParser` / `<template>` so nothing loads while sanitizing.
- Run the same bold-only allowlist on **render**, before assigning `innerHTML`.

### 2. HIGH (demo) — Backspace/Delete in a note deletes the selected canvas shape

Excalidraw's window-level shortcut handler ignores key events only from inputs, textareas, and elements marked `data-type="wysiwyg"` (`isInputLike`, `packages/common/src/utils.ts:69`). The NoteEditor's `contenteditable` div is none of those, so Excalidraw handles the keystroke.

**Reproduced in the browser:**

1. Draw a rectangle; it stays selected.
2. Click into a `contenteditable` box built like NoteEditor's editor, placed in `document.body` as FloatingWindow portals do.
3. Press Backspace, then Delete.
4. The rectangle is deleted from the canvas.

With Authorship/History, that delete would also be recorded against the user. In one run, a typed `r` also appeared to switch the active tool to rectangle.

**Fix verified in the browser:** add `data-type="wysiwyg"` to the editable element (Excalidraw's own exemption), or stop `keydown` propagation from the editor. With either one, the rectangle was **not** deleted. If you use `data-type="wysiwyg"`, check other `[data-type="wysiwyg"]` selectors in Excalidraw for side effects.

_Test-tool caveat:_ the automation tool's Backspace does not edit text even in a plain `<textarea>`, so text-editing behavior could not be confirmed that way. The deletion finding stands: the key event reached Excalidraw and it acted on it.

### 3. MEDIUM — Whole app white-screens without Supabase env vars

`excalidraw-app/data/supabase.ts:8` throws at import when `VITE_APP_SUPABASE_URL` or `VITE_APP_SUPABASE_PUBLISHABLE_KEY` is missing. It is imported by `auth/AuthProvider.tsx`, `auth/useSupabaseAuth.ts`, and `data/boardContext.ts`, so all drawing breaks, not just the new features. Reproduced: a blank page with `Uncaught Error: Missing Supabase environment configuration.`

Every teammate needs a `.env.local`. For deploys, consider degrading the Session Handoff features instead of failing the whole app.

### 4. MEDIUM (code reading) — Escape closes every floating window, even while typing

`components/FloatingWindow/FloatingWindow.tsx:195` listens for Escape on `document`. Each open window closes on one keypress, including while typing in a note, which could discard an unsaved draft. Consider scoping it to the focused window and skipping it while the editor has focus.

### 5. LOW (code reading) — Accessibility gaps in FloatingWindow

- `role="dialog"` is set, but focus is not moved into the window on open or returned to the trigger on close.
- Drag and resize use mouse events only: no touch/pointer or keyboard support.

### 6. LOW (code reading) — Formatter edge cases (not in demo window)

- `formatDisplayNameUnique` resolves only one level: Rob Wilson and Rob Williams both become `Rob Wi`. The first user keeps `Rob W` while the second gets `Rob Wi`, an asymmetry the PRD 11.10 example (`Rob Wi` vs `Rob Wa`) may not intend.
- `getRelativeDateLabel` divides by 24 hours. On the day clocks spring forward, yesterday is only 23 hours back, so it is labeled "Today."

---

## Not yet done

- **Integration.** No app code imports `FloatingWindow`, `NoteEditor`, the state components, or `formatters` yet. Waiting on Rob to define what "integrate" means for Task 8, to avoid a parallel implementation of the History / Notes UI tasks.
- **Authenticated-board checks.** Blocked on Tasks 5 and 6.

## Process

Findings 1 and 2 are in Task 4 code and go back to the Task 4 author under the review gate. They were not fixed on this branch.

---

## Integration harness (added 2026-09-23)

`excalidraw-app/components/Task8VerificationPanel/` mounts the Task 4 shared infrastructure inside the running app, behind a **Task 8** button in the top-right UI. It is a temporary verification harness, not a product feature, and should be deleted once the real History / Personal Notes / Team Notes UIs exist.

It renders FloatingWindow, NoteEditor + NoteEditorToolbar, the loading/error/empty states, and live output from the shared formatters, plus the current auth context (authenticated, display name, board id) so the authenticated-board checks can be run by signing in with the panel open.

### Verified in the running app (signed out)

| Check | Result |
| --- | --- |
| FloatingWindow opens/closes in the real app | Pass |
| Note timestamp format (M/D/YYYY h:mmam/pm) | Pass — `9/23/2026 4:36pm` |
| Authorship format (name + h:mmam/pm + M/D/YY) | Pass — `Rob W 4:36pm 9/23/26` |
| Typing in the editor | Pass |
| Bold toggle + `aria-pressed` | Pass — `handoff check<b> BOLD</b>` |
| Font sizes S/M/L/XL | Pass — L renders at 18px |
| Loading / error / empty states | Pass — retry button correctly disabled during cooldown |
| Window geometry resets on reopen | Pass — moved to 153,106; reopened at default 322,169 (380x430) |
| Backspace/Delete in the note with a shape selected | Pass **only because the harness guards it** (see below) |

### Still blocked

Authenticated-board checks (display name from a real profile, resolved board id, two-user behavior) need the real Supabase publishable key in `.env.local` and a signed-in user. The panel surfaces all three values, so those checks are a sign-in away once the key is available.

### Note on the keyboard guard

The harness wraps the editor in `onKeyDownCapture={(e) => e.stopPropagation()}`. Without it, finding 2 reproduces: Backspace/Delete typed into the note deletes the selected canvas element. The guard lives in the harness so Task 4's NoteEditor is untouched; the real fix still belongs there and is owned by Task 4.

Findings 1 (note HTML rendered unsanitized) and 4-6 remain open and were not addressed here.

---

## Authenticated-board checks (2026-09-23, after migration 004)

Run as a real signed-in user (`trevor.rukwava@pursuit.org`, uid `1eb97569-...`) against production, through the Task 8 panel and the REST API with that user's access token.

| Check | Result | Evidence |
| --- | --- | --- |
| Sign-up → sign-in → authenticated state | Pass | Panel reads `Authenticated: yes` |
| Profile created automatically at signup | **Pass** | `GET /profiles` returns one row, `created_at` = signup time, names from signup metadata. The `on_auth_user_created` trigger works. |
| Display name format (first + last initial) | Pass | `Trevor R` in both the panel and the top-right user button |
| Own-profile UPDATE allowed | Pass | `PATCH /profiles?user_id=eq.<me>` → 200 with the row returned |
| Cross-user profile UPDATE blocked by RLS | **Pass** | `PATCH /profiles?user_id=eq.<other>` → 200 with body `[]`, i.e. **zero rows changed** |
| Direct membership INSERT blocked | Pass (by design) | `POST /board_memberships` → 403, Postgres `42501` |
| Session restored after reload | Pass | Still `Authenticated: yes` / `Trevor R` after a full page reload |
| Board id resolution | Not run here | Needs a live collaboration room (`excalidraw-room` on :3002). Sal verified `resolve_board()` separately. |
| Two-user checks | Not run | Needs a second confirmed account |

### Bearing on Task 7's four remaining failures

The API evidence above supports reading three of Sal's four failures as test expectations rather than migration gaps:

1. **"User A/B can create own profile" (403 on INSERT).** The profile row already exists — created by the signup trigger. Migration 004 deliberately grants only `select, update` on `profiles`. The test should assert the row exists after signup and then UPDATE it; UPDATE works (verified above).
2. **"User A cannot modify User B's profile (RLS)" reported as FAIL.** A PATCH that matches no rows returns a success status with an empty body. Verified above: status 200, body `[]`, nothing changed. RLS is holding. The test needs to assert on rows returned/changed, not on the status code.
3. **"User B membership created" (403 on INSERT).** Membership creation is deliberately routed through `resolve_board()` (security definer, granted to authenticated). The test should call the RPC rather than inserting directly.

One cleanup for whoever owns the migrations: the `profiles_insert_own` policy exists while the table-level INSERT privilege is intentionally withheld, so the policy can never apply. Either grant INSERT (the policy's `with check` is already `user_id = auth.uid()`) or drop the unused policy, so this stops looking like a missing grant.
