# Item 5 - Two-user verification

**Owner:** Trevor **Date:** 2026-09-23 **Environment:** production Supabase (`nboqhzztdccouamrgsmk`), local app on :3001, `excalidraw-room` on :3002, real signed-in users through the app and its REST API.

**Users:** A = `trevor.rukwava@pursuit.org` (`1eb97569...`), B = `trukwava@gmail.com` (`a608de8d...`). **Board:** `f8981be4...`, resolved from room `3dc6a4c3ddb1581ee667`.

## Results

| # | Check | Result |
| --- | --- | --- |
| 1 | Both users resolve the SAME board from the same room | Pass - membership table shows both `1eb97569` and `a608de8d` on board `f8981be4` |
| 2 | Membership is created through `resolve_board()`, not direct insert | Pass - B's membership appeared after calling the RPC; direct INSERT returns 403 |
| 3 | Resolution is idempotent across users and calls | Pass - repeated calls from both users return the same board_id |
| 4 | A different room resolves to a different board | Pass |
| 5 | Board members can see each other's profiles | Pass - B sees "Trevor Rukwava" and "Trevor Test" |
| 6 | A user cannot modify another user's profile | Pass - PATCH returns 200 with **0 rows changed** |
| 7 | Personal notes are owner-only: other member cannot READ | Pass - A sees `[]`, both listing and by note id |
| 8 | Personal notes: other member cannot UPDATE | Pass - 0 rows changed |
| 9 | Personal notes: other member cannot DELETE | Pass - 0 rows deleted |
| 10 | No cross-board leakage | Pass - notes from board `f8981be4` are not visible on another board |
| 11 | Signed-out visitor cannot read protected tables | Pass - `personal_notes`, `profiles`, `boards` all return 401 (`42501`) |
| 12 | Signed-out visitor cannot resolve a board | Pass - 401, "permission denied for function resolve_board" |

## Note on assertion style

Checks 6, 8 and 9 return **HTTP 200 with an empty body**, not an error. PostgREST reports success for a statement that matched no rows; RLS removes the rows before the write applies. Any test that asserts only on the status code will read these as failures. Assert on **rows returned/changed** (send `Prefer: return=representation`).

This is the cause of the Task 7 failure "User A cannot modify User B's profile", now reproduced with two real users: the policy is working.

## Not covered (as of the first run)

- **Session Handoff two-user sharing.** Blocked at the time of this run: the `session_handoffs` table had not yet been applied. **Superseded** - migration 004 was applied later the same day and the two-user handoff verification below was run against it.
- **Signed-out handoff visibility.** Also superseded: with the table applied, a signed-in save goes to Supabase, and the panel now clears on sign-out.

## Test data left behind

- Personal note `0ce7b393...` owned by B on board `f8981be4...`
- Board row for the isolation-test room `qa-isolation-test-room-01`

---

## Session Handoff two-user verification (after migration 004 applied)

Re-run once `session_handoffs` existed in production. Browser-local handoff copies were deleted first, so anything displayed had to come from the server.

| # | Check | Result |
| --- | --- | --- |
| 13 | A saves the handoff; it persists to Supabase, not the browser | **Pass** - row in `session_handoffs` for board `f8981be4`, no local copy, panel no longer says "(this browser only)" |
| 14 | Row records author and time | Pass - `updated_by` = A's uid, `updated_by_name` "Trevor R", `updated_at` set |
| 15 | B opens the same board and sees A's handoff | **Pass** - panel auto-opened for B with A's text and "Updated 9/23/2026 9:31pm by Trevor R"; B had no local copy |
| 16 | Handoff persists across reload for B | Pass |
| 17 | A different board does not expose it | Pass - on another room, the panel does not open and fields are empty |
| 18 | B sees only handoffs for boards they belong to | Pass - one row returned, for the shared board |
| 19 | Signed-out user cannot read handoffs | Pass - 401 (`42501`) |
| 20 | Sign-out clears the handoff from the screen | Pass after fix (below) |

### Fix made during this run

Signing out left the previous user's handoff visible in the panel: stale client state, not a server-side leak (the API rejects signed-out reads, check 19). The panel now clears its contents when the user is not authenticated, so a shared machine cannot show the last session's handoff to the next person.

### Known limitation

Switching boards by editing the room hash **without reloading** leaves the previous board's handoff on screen until the page reloads. On a normal load of a different board the panel is correctly empty (check 17). Worth a `hashchange` listener if in-place board switching is expected.

---

## Fail-closed saving (review follow-up)

Review found that a failed Supabase write on a collaborative board fell back to a browser-local copy and still reported success, so the UI could show "saved" for a handoff collaborators could not see.

`saveSessionHandoff` now fails closed: when a board_id exists, a failed write (or a missing session) throws, and the panel shows its existing "Could not save. Try again." state. The browser-local path is used only when there is no board_id at all - signed out, or not in a collaborative session.

| Check | Result |
| --- | --- |
| Save on a collaborative board still writes to Supabase | Pass |
| Failed shared write surfaces an error instead of saving locally | Pass - rejected write throws; panel shows "Could not save. Try again." and no local copy is written |
| Local path still used when there is no board (signed out / no room) | Pass |

### Intermittent issue found while re-verifying (not in Session Handoff code)

On one page load out of three, User B opened the shared board while signed in and
the handoff panel stayed empty, even though the row was readable by that user via
the API. Cause appears to be a race in board resolution: `Collab.startCollaboration`
reads `supabaseUserAtom` when joining the room, but session restoration is
asynchronous, so a slow restore leaves the user null at that moment, board
resolution is skipped, and `currentBoardIdAtom` stays null for the session. Two
subsequent reloads worked.

This affects the core returning-collaborator flow (a returning user can open the
board and see nothing) and lives in the board resolution integration, not in the
Session Handoff feature. Suggested fix, for whoever owns that code: re-resolve the
board when authentication completes, rather than only at join time.
