# Construct Cycle Two - Implementation Tasks

**PRD Reference:** `C:\Users\ruizc\Downloads\Construct -CycleTwo Tech PRD.pdf`

**Key Rules:**
- Identity comes from Supabase Auth only — never from Excalidraw collaborator/display names
- Do not hard-code demo credentials or secrets anywhere
- If unclear, ask questions. Do not assume anything.

---

## Task 2 - Inspect Supabase Auth Integration Points ✅ COMPLETE

**PRD Sections:** 3.3, 4.1-4.9, 10.12, 11.2

**Status:** Complete - Analysis documented in `docs/TASK2-supabase-auth-integration-analysis.md`

**Summary:**
- Identified session establishment/restoration points
- Identified sign-in/account creation integration points
- Confirmed profile data: first_name, last_name
- Confirmed UUID for ownership/actor fields
- Verified Excalidraw collaborator identity ≠ security identity

**Unlocks:**
- Profile/membership implementation
- Authenticated feature data access
- Prepared two-account demo setup

---

## Remaining Tasks (Based on PRD)

### Foundation Tasks (Must be done first per PRD 16.2-16.4)

#### Task: Implement Supabase Client Setup
**PRD Sections:** 3.1, 4.1-4.9, 11.2
- Create `excalidraw-app/supabase/client.ts`
- Add environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- No hard-coded secrets

#### Task: Implement Auth Provider & Session Management
**PRD Sections:** 4.1-4.9, 11.2
- Create `excalidraw-app/auth/AuthProvider.tsx`
- Implement session restoration on app load
- Implement sign-in/sign-up UI
- Implement sign-out
- Return user to board context after auth

#### Task: Implement User Profiles Table & RLS
**PRD Sections:** 9.2, 10.8
- Create profiles table (user_id, first_name, last_name, created_at, updated_at)
- One-to-one with auth.users
- RLS: users can read board members' profiles, update only own

#### Task: Implement Board Identity Mapping (roomId → board_id)
**PRD Sections:** 3.2, 9.3, 16.3
- Create boards table with internal board_id (UUID)
- Store roomId as external reference (unique constraint)
- NEVER store roomKey
- Verify same roomId → same board, different roomId → different board

#### Task: Implement Board Memberships
**PRD Sections:** 2.1, 4.2, 9.4, 10.2, 10.9
- Create board_memberships table (board_id, user_id, joined_at)
- Unique constraint on board_id + user_id
- Idempotent membership creation
- RLS: users can only create membership for themselves

---

### Feature Tasks (After foundation is verified)

#### Task: Element Authorship
**PRD Sections:** 2.2, 5.1-5.7, 9.5, 10.4
- Create element_authorship table
- Hook element creation to persist authorship
- Display "Rob W 11:42am 9/18/26" format on hover
- Never transfer authorship on modification

#### Task: History Panel
**PRD Sections:** 2.3, 6.1-6.9, 9.6, 10.5
- Create history_events table
- Hook meaningful Excalidraw actions
- Floating window UI
- 15-minute grouping, archive hierarchy

#### Task: Personal Notes
**PRD Sections:** 2.4, 7.1-7.13, 9.7, 10.3
- Create personal_notes table
- Owner-only RLS (strict privacy)
- Floating window with formatting
- Autosave, DONE behavior

#### Task: Team Notes
**PRD Sections:** 2.5, 8.1-8.17, 9.8-9.9, 10.6-10.7, 10.10-10.11
- Create team_notes and team_note_viewers tables
- Everyone vs Selected visibility
- Draft → Publication flow
- Author-only edit/delete, recipients read-only

---

### Integration & Demo Tasks

#### Task: Shared Frontend Infrastructure
**PRD Sections:** 11.8-11.16, 16.5
- Display name formatter (first + last initial, collision handling)
- Date/time formatter (M/D/YYYY, h:mmam/pm)
- Floating window component
- Note editor component

#### Task: Two-Account Demo Setup
**PRD Sections:** 14.2, 14.10
- Create two test accounts in Supabase (credentials NOT in code)
- Verify both can join same board
- Verify data isolation (Personal Notes)
- Prepare known-good demo state

---

## Implementation Order (PRD 16.9)

1. ✅ Technical PRD locked
2. ✅ Task 2: Inspect integration points
3. ⬜ Implement roomId-to-board_id mapping
4. ⬜ Redesign database migration and RLS
5. ⬜ Verify authentication/profile/membership foundation
6. ⬜ Establish shared frontend infrastructure
7. ⬜ Implement feature work (can parallelize after foundation)
8. ⬜ Verify each feature and security boundary
9. ⬜ Integrated regression testing
10. ⬜ Prepare and rehearse two-account demo
