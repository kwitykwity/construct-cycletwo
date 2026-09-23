# Task 6: Two-Account RLS + Privacy + Authorization Verification

**Purpose:** Manual SQL verification of all RLS policies using two authenticated test users.

**Prerequisites:**

- Migrations 001, 002, 003 applied to Supabase
- Two test accounts created in Supabase Auth (via app sign-up or dashboard)

---

## Setup: Identify Test Users

Run this first to get your test user IDs:

```sql
-- Get all users and their profiles
SELECT
  u.id as user_id,
  u.email,
  p.first_name,
  p.last_name,
  u.created_at
FROM auth.users u
LEFT JOIN profiles p ON p.user_id = u.id
ORDER BY u.created_at;
```

**Record the two user IDs for testing:**

- User A (first tester): `________________________________`
- User B (second tester): `________________________________`

---

## 1. Board Membership Verification

### 1.1 Create a shared board (as User A)

In Supabase SQL Editor, use "Run as User" feature or set role:

```sql
-- Set session to run as User A
-- In Supabase Dashboard: Use the "Run as" dropdown OR:
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

-- Create board via resolve_board RPC
SELECT resolve_board('test-room-12345');
```

Record the returned board_id: `________________________________`

### 1.2 Join same board (as User B)

```sql
-- Set session to run as User B
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

-- Join same board
SELECT resolve_board('test-room-12345');
```

Should return the SAME board_id as User A.

### 1.3 Verify both users are members

```sql
-- As service role (bypass RLS)
SELECT
  bm.board_id,
  bm.user_id,
  p.first_name,
  p.last_name,
  bm.joined_at
FROM board_memberships bm
JOIN profiles p ON p.user_id = bm.user_id
WHERE bm.board_id = '<BOARD_ID>'
ORDER BY bm.joined_at;
```

**Expected:** Both User A and User B appear as members.

---

## 2. Personal Notes Privacy (Owner-Only)

### 2.1 User A creates a personal note

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

INSERT INTO personal_notes (board_id, owner_id, content)
VALUES (
  '<BOARD_ID>',
  '<USER_A_ID>',
  '[{"text": "User A private note", "bold": false}]'::jsonb
)
RETURNING id;
```

Record note ID: `________________________________`

### 2.2 User A can read their own note

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

SELECT * FROM personal_notes WHERE owner_id = '<USER_A_ID>';
```

**Expected:** Returns the note.

### 2.3 User B CANNOT read User A's personal note

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

-- Attempt to read User A's note
SELECT * FROM personal_notes WHERE owner_id = '<USER_A_ID>';
```

**Expected:** Returns ZERO rows (RLS blocks access).

### 2.4 User B CANNOT update User A's personal note

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

-- Attempt to update User A's note
UPDATE personal_notes
SET content = '[{"text": "HACKED!", "bold": false}]'::jsonb
WHERE id = '<USER_A_NOTE_ID>';
```

**Expected:** 0 rows affected (RLS blocks).

### 2.5 User B CANNOT delete User A's personal note

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

DELETE FROM personal_notes WHERE id = '<USER_A_NOTE_ID>';
```

**Expected:** 0 rows affected (RLS blocks).

### 2.6 User B CANNOT insert a note as User A

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

-- Attempt to forge owner_id
INSERT INTO personal_notes (board_id, owner_id, content)
VALUES (
  '<BOARD_ID>',
  '<USER_A_ID>',  -- Trying to impersonate User A
  '[{"text": "Forged note"}]'::jsonb
);
```

**Expected:** ERROR - RLS policy violation.

---

## 3. Team Notes Draft Privacy (Author-Only Before Publication)

### 3.1 User A creates a draft team note

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

INSERT INTO team_notes (board_id, author_id, content)
VALUES (
  '<BOARD_ID>',
  '<USER_A_ID>',
  '[{"text": "Draft team note by User A", "bold": false}]'::jsonb
)
RETURNING id;
```

Record draft note ID: `________________________________`

### 3.2 User A can see their draft

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

SELECT id, author_id, content, visibility_type, published_at
FROM team_notes
WHERE id = '<DRAFT_NOTE_ID>';
```

**Expected:** Returns the draft (published_at is NULL).

### 3.3 User B CANNOT see User A's draft

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

SELECT * FROM team_notes WHERE id = '<DRAFT_NOTE_ID>';
```

**Expected:** Returns ZERO rows.

### 3.4 User B CANNOT see ANY drafts by User A

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

SELECT * FROM team_notes
WHERE author_id = '<USER_A_ID>'
  AND published_at IS NULL;
```

**Expected:** Returns ZERO rows.

---

## 4. Team Notes Publication - Everyone Visibility

### 4.1 User A publishes with 'everyone' visibility

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

SELECT publish_team_note(
  '<DRAFT_NOTE_ID>',
  '[{"text": "Published for everyone!", "bold": true}]'::jsonb,
  'everyone'::team_note_visibility,
  NULL  -- No selected viewers needed
);
```

**Expected:** Returns the note ID.

### 4.2 User B CAN now see the published note

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

SELECT id, author_id, content, visibility_type, published_at
FROM team_notes
WHERE id = '<DRAFT_NOTE_ID>';
```

**Expected:** Returns the note with visibility_type = 'everyone'.

### 4.3 User B CANNOT update the published note

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

UPDATE team_notes
SET content = '[{"text": "HACKED!"}]'::jsonb
WHERE id = '<DRAFT_NOTE_ID>';
```

**Expected:** 0 rows affected.

### 4.4 User B CANNOT delete the published note

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

DELETE FROM team_notes WHERE id = '<DRAFT_NOTE_ID>';
```

**Expected:** 0 rows affected.

---

## 5. Team Notes Publication - Selected Visibility

### 5.1 User A creates another draft

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

INSERT INTO team_notes (board_id, author_id, content)
VALUES (
  '<BOARD_ID>',
  '<USER_A_ID>',
  '[{"text": "Selected visibility note"}]'::jsonb
)
RETURNING id;
```

Record note ID: `________________________________`

### 5.2 User A publishes with 'selected' visibility (for User B only)

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

SELECT publish_team_note(
  '<SELECTED_NOTE_ID>',
  '[{"text": "Only for User B!"}]'::jsonb,
  'selected'::team_note_visibility,
  ARRAY['<USER_B_ID>']::uuid[]
);
```

**Expected:** Returns the note ID.

### 5.3 User B CAN see the note (they are a selected viewer)

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

SELECT id, author_id, content, visibility_type
FROM team_notes
WHERE id = '<SELECTED_NOTE_ID>';
```

**Expected:** Returns the note.

### 5.4 User B can see they are a viewer

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

SELECT * FROM team_note_viewers
WHERE team_note_id = '<SELECTED_NOTE_ID>'
  AND user_id = '<USER_B_ID>';
```

**Expected:** Returns one row.

### 5.5 Create User C (or use a third account) - should NOT see the note

If you have a third user:

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_C_ID>';

SELECT * FROM team_notes WHERE id = '<SELECTED_NOTE_ID>';
```

**Expected:** Returns ZERO rows (User C is not author or viewer).

---

## 6. Visibility Change via Atomic RPC Only

### 6.1 User A changes visibility to 'everyone'

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

SELECT update_team_note_visibility(
  '<SELECTED_NOTE_ID>',
  'everyone'::team_note_visibility,
  NULL
);
```

**Expected:** Success. Note now visible to all board members.

### 6.2 User B CANNOT change visibility

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

SELECT update_team_note_visibility(
  '<SELECTED_NOTE_ID>',
  'selected'::team_note_visibility,
  ARRAY['<USER_B_ID>']::uuid[]
);
```

**Expected:** ERROR - "Only the author can change visibility"

### 6.3 Direct UPDATE of published_at is blocked

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

-- Attempt to "unpublish" by setting published_at to NULL
UPDATE team_notes
SET published_at = NULL
WHERE id = '<SELECTED_NOTE_ID>';
```

**Expected:** 0 rows affected (policy only allows draft updates).

---

## 7. Element Authorship - Creator Identity Cannot Be Forged

### 7.1 User A creates element authorship record

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

INSERT INTO element_authorship (board_id, element_id, created_by)
VALUES (
  '<BOARD_ID>',
  'element-abc-123',
  '<USER_A_ID>'
)
RETURNING id;
```

**Expected:** Success.

### 7.2 User B CANNOT create authorship as User A

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

INSERT INTO element_authorship (board_id, element_id, created_by)
VALUES (
  '<BOARD_ID>',
  'element-def-456',
  '<USER_A_ID>'  -- Trying to forge created_by
);
```

**Expected:** ERROR - RLS policy violation.

### 7.3 Authorship CANNOT be updated

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

UPDATE element_authorship
SET created_by = '<USER_B_ID>'  -- Trying to transfer authorship
WHERE element_id = 'element-abc-123';
```

**Expected:** 0 rows affected (no UPDATE policy).

### 7.4 Authorship CANNOT be deleted

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

DELETE FROM element_authorship WHERE element_id = 'element-abc-123';
```

**Expected:** 0 rows affected (no DELETE policy).

---

## 8. History Events - Actor Identity Cannot Be Forged, Append-Only

### 8.1 User A creates history event

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

INSERT INTO history_events (board_id, actor_id, action, target_info)
VALUES (
  '<BOARD_ID>',
  '<USER_A_ID>',
  'Created',
  '{"element_type": "rectangle", "count": 1}'::jsonb
)
RETURNING id;
```

**Expected:** Success.

### 8.2 User B CANNOT create event as User A

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

INSERT INTO history_events (board_id, actor_id, action, target_info)
VALUES (
  '<BOARD_ID>',
  '<USER_A_ID>',  -- Forging actor_id
  'Deleted',
  '{"element_type": "rectangle"}'::jsonb
);
```

**Expected:** ERROR - RLS policy violation.

### 8.3 History events CANNOT be updated

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

UPDATE history_events
SET action = 'Edited'
WHERE actor_id = '<USER_A_ID>';
```

**Expected:** 0 rows affected (append-only).

### 8.4 History events CANNOT be deleted

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

DELETE FROM history_events WHERE actor_id = '<USER_A_ID>';
```

**Expected:** 0 rows affected (append-only).

---

## 9. Cross-Board Data Leakage Prevention

### 9.1 Create a second board (User A only)

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

SELECT resolve_board('private-board-xyz');
```

Record second board ID: `________________________________`

### 9.2 User A creates personal note on second board

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

INSERT INTO personal_notes (board_id, owner_id, content)
VALUES (
  '<SECOND_BOARD_ID>',
  '<USER_A_ID>',
  '[{"text": "Private board note"}]'::jsonb
)
RETURNING id;
```

### 9.3 User B CANNOT see data from board they don't belong to

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

-- Try to read personal notes from second board
SELECT * FROM personal_notes WHERE board_id = '<SECOND_BOARD_ID>';
```

**Expected:** ZERO rows.

```sql
-- Try to read team notes from second board
SELECT * FROM team_notes WHERE board_id = '<SECOND_BOARD_ID>';
```

**Expected:** ZERO rows.

```sql
-- Try to read element authorship from second board
SELECT * FROM element_authorship WHERE board_id = '<SECOND_BOARD_ID>';
```

**Expected:** ZERO rows.

```sql
-- Try to read history from second board
SELECT * FROM history_events WHERE board_id = '<SECOND_BOARD_ID>';
```

**Expected:** ZERO rows.

### 9.4 User B CANNOT insert data into board they don't belong to

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

INSERT INTO personal_notes (board_id, owner_id, content)
VALUES (
  '<SECOND_BOARD_ID>',  -- Board User B is NOT a member of
  '<USER_B_ID>',
  '[{"text": "Attempted injection"}]'::jsonb
);
```

**Expected:** ERROR - RLS policy violation.

---

## 10. Profile Visibility

### 10.1 User A can see User B's profile (co-board members)

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_A_ID>';

SELECT * FROM profiles WHERE user_id = '<USER_B_ID>';
```

**Expected:** Returns User B's profile (they share a board).

### 10.2 Users can only update their own profile

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

UPDATE profiles
SET first_name = 'HACKED'
WHERE user_id = '<USER_A_ID>';
```

**Expected:** 0 rows affected.

---

## 11. Direct Membership Manipulation Prevention

### 11.1 User B CANNOT directly insert themselves into a board

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

-- Try to add self to second board without resolve_board
INSERT INTO board_memberships (board_id, user_id)
VALUES ('<SECOND_BOARD_ID>', '<USER_B_ID>');
```

**Expected:** ERROR - No INSERT policy (must use resolve_board RPC).

### 11.2 User B CANNOT add User A to a board

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<USER_B_ID>';

INSERT INTO board_memberships (board_id, user_id)
VALUES ('<BOARD_ID>', '<USER_A_ID>');
```

**Expected:** ERROR - No INSERT policy.

---

## Verification Checklist

| Test                                    | Expected      | Actual | Pass? |
| --------------------------------------- | ------------- | ------ | ----- |
| 1.1 User A creates board                | Success       |        |       |
| 1.2 User B joins same board             | Same board_id |        |       |
| 1.3 Both users are members              | 2 rows        |        |       |
| 2.2 User A reads own note               | 1 row         |        |       |
| 2.3 User B cannot read A's note         | 0 rows        |        |       |
| 2.4 User B cannot update A's note       | 0 affected    |        |       |
| 2.5 User B cannot delete A's note       | 0 affected    |        |       |
| 2.6 User B cannot forge owner_id        | ERROR         |        |       |
| 3.2 User A sees own draft               | 1 row         |        |       |
| 3.3 User B cannot see A's draft         | 0 rows        |        |       |
| 4.1 User A publishes (everyone)         | Success       |        |       |
| 4.2 User B sees published note          | 1 row         |        |       |
| 4.3 User B cannot update                | 0 affected    |        |       |
| 5.2 Selected visibility publish         | Success       |        |       |
| 5.3 Viewer can see note                 | 1 row         |        |       |
| 5.5 Non-viewer cannot see               | 0 rows        |        |       |
| 6.2 Non-author cannot change visibility | ERROR         |        |       |
| 6.3 Direct published_at UPDATE blocked  | 0 affected    |        |       |
| 7.2 Cannot forge created_by             | ERROR         |        |       |
| 7.3 Authorship cannot be updated        | 0 affected    |        |       |
| 7.4 Authorship cannot be deleted        | 0 affected    |        |       |
| 8.2 Cannot forge actor_id               | ERROR         |        |       |
| 8.3 Events cannot be updated            | 0 affected    |        |       |
| 8.4 Events cannot be deleted            | 0 affected    |        |       |
| 9.3 Cross-board read blocked            | 0 rows        |        |       |
| 9.4 Cross-board insert blocked          | ERROR         |        |       |
| 10.2 Cannot update other's profile      | 0 affected    |        |       |
| 11.1 Direct membership insert blocked   | ERROR         |        |       |

---

## Cleanup (Optional)

After testing, clean up test data:

```sql
-- Run as service role (bypass RLS)
DELETE FROM personal_notes WHERE board_id IN (
  SELECT id FROM boards WHERE excalidraw_room_id LIKE 'test-%' OR excalidraw_room_id LIKE 'private-%'
);
DELETE FROM team_note_viewers WHERE team_note_id IN (
  SELECT id FROM team_notes WHERE board_id IN (
    SELECT id FROM boards WHERE excalidraw_room_id LIKE 'test-%' OR excalidraw_room_id LIKE 'private-%'
  )
);
DELETE FROM team_notes WHERE board_id IN (
  SELECT id FROM boards WHERE excalidraw_room_id LIKE 'test-%' OR excalidraw_room_id LIKE 'private-%'
);
DELETE FROM element_authorship WHERE board_id IN (
  SELECT id FROM boards WHERE excalidraw_room_id LIKE 'test-%' OR excalidraw_room_id LIKE 'private-%'
);
DELETE FROM history_events WHERE board_id IN (
  SELECT id FROM boards WHERE excalidraw_room_id LIKE 'test-%' OR excalidraw_room_id LIKE 'private-%'
);
DELETE FROM board_memberships WHERE board_id IN (
  SELECT id FROM boards WHERE excalidraw_room_id LIKE 'test-%' OR excalidraw_room_id LIKE 'private-%'
);
DELETE FROM boards WHERE excalidraw_room_id LIKE 'test-%' OR excalidraw_room_id LIKE 'private-%';
```
