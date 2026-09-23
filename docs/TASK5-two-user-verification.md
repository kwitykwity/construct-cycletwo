# Item 5 - Two-user verification

**Owner:** Trevor
**Date:** 2026-09-23
**Environment:** production Supabase (`nboqhzztdccouamrgsmk`), local app on :3001,
`excalidraw-room` on :3002, real signed-in users through the app and its REST API.

**Users:** A = `trevor.rukwava@pursuit.org` (`1eb97569...`),
B = `trukwava@gmail.com` (`a608de8d...`).
**Board:** `f8981be4...`, resolved from room `3dc6a4c3ddb1581ee667`.

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

Checks 6, 8 and 9 return **HTTP 200 with an empty body**, not an error. PostgREST
reports success for a statement that matched no rows; RLS removes the rows before
the write applies. Any test that asserts only on the status code will read these
as failures. Assert on **rows returned/changed** (send `Prefer: return=representation`).

This is the cause of the Task 7 failure "User A cannot modify User B's profile",
now reproduced with two real users: the policy is working.

## Not covered

- **Session Handoff two-user sharing.** Blocked: the `session_handoffs` table has
  not been applied (`PGRST205 - Could not find the table`). Until then the handoff
  falls back to browser-local storage, so User B cannot see User A's handoff. The
  UI is built and ready; this becomes a 5-minute re-test once the migration lands.
- **Signed-out handoff visibility.** With the browser fallback, a locally saved
  handoff survives sign-out on that machine. Applying the table removes this.

## Test data left behind

- Personal note `0ce7b393...` owned by B on board `f8981be4...`
- Board row for the isolation-test room `qa-isolation-test-room-01`
