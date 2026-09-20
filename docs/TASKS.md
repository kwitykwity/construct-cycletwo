# Construct Cycle Two - Implementation Tasks

**PRD Reference:** `C:\Users\ruizc\Downloads\Construct -CycleTwo Tech PRD.pdf`

**Key Rules:**

- Identity comes from Supabase Auth only — never from Excalidraw collaborator/display names
- Do not hard-code demo credentials or secrets anywhere
- If unclear, ask questions. Do not assume anything.

---

## Task 2 - Supabase Auth Integration ✅ IMPLEMENTATION COMPLETE

**PRD Sections:** 3.3, 4.1-4.9, 10.12, 11.2

**Status:** Implementation complete / Two-account integration verification pending

**Documentation:** `docs/TASK2-supabase-auth-integration-analysis.md`

**Completed:**

- ✅ Identified session establishment/restoration points
- ✅ Identified sign-in/account creation integration points
- ✅ Confirmed profile data: first_name, last_name
- ✅ Confirmed UUID for ownership/actor fields
- ✅ Verified Excalidraw collaborator identity ≠ security identity
- ✅ Auth Provider implemented and tested in browser
- ✅ Sign-in/Sign-up/Sign-out working

**Pending Verification:**

- ⏳ Two-account integration test (two real accounts on same board)
- ⏳ Verify UUID identity separation works for:
  - Board membership
  - RLS policies
  - Element Authorship
  - Personal Notes privacy
  - Team Notes visibility

**Unlocks:**

- Profile/membership implementation
- Authenticated feature data access
- Two-account demo setup

---

## Foundation Tasks (PRD 16.2-16.4)

### Task: Implement Supabase Client Setup ✅ COMPLETE

**PRD Sections:** 3.1, 4.1-4.9, 11.2

**Status:** Complete (Rob's branch merged)

**Files:**

- `excalidraw-app/data/supabase.ts` - Supabase client with env vars
- `excalidraw-app/vite-env.d.ts` - TypeScript declarations for `VITE_APP_SUPABASE_URL`, `VITE_APP_SUPABASE_PUBLISHABLE_KEY`

**Verified:**

- ✅ No hard-coded secrets
- ✅ Throws error if env vars missing

---

### Task: Implement Board Identity Mapping (roomId → board_id) ✅ COMPLETE

**PRD Sections:** 3.2, 9.3, 16.3

**Status:** Complete (Rob's branch merged)

**Files:**

- `excalidraw-app/data/boardContext.ts` - `getExcalidrawRoomId()` and `getBoardIdForRoom()`
- `backend/supabase/migrations/001_initial_schema.sql` - `resolve_board()` RPC function

**Verified:**

- ✅ roomId parsed from collaboration link
- ✅ roomKey NEVER passed to Supabase
- ✅ `resolve_board()` creates board if missing, returns stable board_id
- ✅ Idempotent membership creation in same function
- ✅ Only authenticated users can call

---

### Task: Implement User Profiles Table & RLS ✅ COMPLETE

**PRD Sections:** 9.2, 10.8

**Status:** Complete (schema + RLS policies drafted)

**Files:**

- `backend/supabase/migrations/001_initial_schema.sql` - profiles table
- `backend/supabase/migrations/002_rls_policies.sql` - RLS policies + auto-creation trigger

**Verified:**

- ✅ One-to-one with auth.users (user_id PK references auth.users)
- ✅ Fields: user_id, first_name, last_name, created_at, updated_at
- ✅ RLS: users can read own + board members' profiles
- ✅ RLS: users can only update own profile
- ✅ Auto-creation trigger on auth.users signup

---

### Task: Implement Board Memberships ✅ COMPLETE

**PRD Sections:** 2.1, 4.2, 9.4, 10.2, 10.9

**Status:** Complete (schema + RLS policies drafted)

**Files:**

- `backend/supabase/migrations/001_initial_schema.sql` - board_memberships table
- `backend/supabase/migrations/002_rls_policies.sql` - RLS policies

**Verified:**

- ✅ Composite PK on (board_id, user_id) - enforces uniqueness
- ✅ joined_at timestamp
- ✅ Idempotent creation via `resolve_board()` ON CONFLICT DO NOTHING
- ✅ RLS: users can only insert membership for themselves
- ✅ RLS: users can read memberships for boards they belong to

---

### Task: Implement Feature Tables & RLS ✅ COMPLETE (Schema Ready)

**PRD Sections:** 9.5-9.9, 10.3-10.7

**Status:** Complete - Schema and RLS policies drafted, ready for migration

**Files:**

- `backend/supabase/migrations/003_feature_tables.sql`

**Tables Created:** | Table | PRD | RLS | |-------|-----|-----| | `element_authorship` | 9.5, 10.4 | Board members read; Insert own only; No update/delete | | `history_events` | 9.6, 10.5 | Board members read; Insert own only; Append-only | | `personal_notes` | 9.7, 10.3 | Owner-only CRUD; Board membership required | | `team_notes` | 9.8, 10.6 | Author sees all; Published visibility rules enforced | | `team_note_viewers` | 9.9, 10.7 | Author manages; Viewer must be board member |

---

### Task: Implement Auth Provider & Session Management ✅ COMPLETE

**PRD Sections:** 4.1-4.9, 11.2

**Status:** Complete and tested in browser

**Files:**

- `excalidraw-app/auth/atoms.ts` - Jotai atoms for auth state
- `excalidraw-app/auth/AuthProvider.tsx` - Session management, auth state changes
- `excalidraw-app/auth/useSupabaseAuth.ts` - signIn/signUp/signOut hooks
- `excalidraw-app/auth/AuthDialog.tsx` - Sign-in/Sign-up modal UI (custom SimpleModal, not Excalidraw Dialog)
- `excalidraw-app/auth/AuthDialog.scss` - Modal and dialog styling
- `excalidraw-app/auth/UserAuthButton.tsx` - Top-right sign-in button / user menu
- `excalidraw-app/auth/UserAuthButton.scss` - Button styling
- `excalidraw-app/auth/index.ts` - Module exports
- `excalidraw-app/App.tsx` - AuthProvider + UserAuthButton integrated

**Verified (tested in browser):**

- ✅ Sign-in button appears in top-right UI
- ✅ Auth dialog opens when clicking Sign In
- ✅ Sign-up creates account in Supabase Auth
- ✅ Sign-up captures first_name, last_name in user metadata (4.8)
- ✅ Sign-in with email/password works (4.6)
- ✅ Sign-out clears session (4.5)
- ✅ Session restoration on app load (4.4)
- ✅ User menu with sign-out option when authenticated
- ✅ TypeScript compiles with no errors
- ✅ ESLint passes with no errors

**Implementation Notes:**

- Uses custom `SimpleModal` instead of Excalidraw's `<Dialog>` to avoid context dependency issues
- Imports Jotai hooks from `app-jotai` (project convention, not directly from `jotai`)
- Profile loading gracefully falls back to "User" when profiles table doesn't exist

**Awaiting Migrations:**

- ⏳ Display name shows "User" until `profiles` table exists with `handle_new_user` trigger
- ⏳ Profile data (first_name, last_name) stored in Supabase Auth user metadata, needs migration to copy to profiles table

---

## Feature Tasks (After foundation is verified)

### Task: Element Authorship ⬜ TODO

**PRD Sections:** 2.2, 5.1-5.7, 9.5, 10.4

**Dependencies:** Auth Provider ✅, Feature Tables Migration (pending)

**Required:**

- Hook element creation to persist authorship
- Display "Rob W 11:42am 9/18/26" format on hover
- Never transfer authorship on modification
- Handle missing authorship gracefully ("Author unavailable")

---

### Task: History Panel ⬜ TODO

**PRD Sections:** 2.3, 6.1-6.9, 9.6, 10.5

**Dependencies:** Auth Provider ✅, Feature Tables Migration (pending)

**Required:**

- Hook meaningful Excalidraw actions (Created, Edited, Moved, etc.)
- Floating window UI (movable, resizable)
- 15-minute grouping logic
- Archive hierarchy (Today, Yesterday, weeks, months, years)
- Loading/empty/error states

---

### Task: Personal Notes ⬜ TODO

**PRD Sections:** 2.4, 7.1-7.13, 9.7, 10.3

**Dependencies:** Auth Provider ✅, Feature Tables Migration (pending), Shared Frontend Infrastructure

**Required:**

- Floating window UI
- Note editor with formatting (bold, S/M/L/XL sizes)
- Autosave with debounce
- DONE button behavior
- Delete confirmation
- Unsaved changes protection

---

### Task: Team Notes ⬜ TODO

**PRD Sections:** 2.5, 8.1-8.17, 9.8-9.9, 10.6-10.7, 10.10-10.11

**Dependencies:** Personal Notes (shared editor), Feature Tables Migration (pending)

**Required:**

- Everyone vs Selected visibility picker
- Draft → Publication flow (DONE publishes)
- Author-only edit/delete
- Recipients read-only view
- Visibility change handling

---

## Integration & Demo Tasks

### Task: Shared Frontend Infrastructure ✅ IMPLEMENTATION COMPLETE

**PRD Sections:** 11.8-11.16, 16.5

**Status:** All components implemented

**Plan:** `docs/TASK4-shared-frontend-plan.md`

**Implemented Components:**

| Component | Location | Status |
| --- | --- | --- |
| `formatters.ts` | `excalidraw-app/utils/` | ✅ Complete |
| `states/` | `excalidraw-app/components/` | ✅ Complete |
| `FloatingWindow/` | `excalidraw-app/components/` | ✅ Complete |
| `NoteEditor/` | `excalidraw-app/components/` | ✅ Complete |

**Features Delivered:**

- ✅ `formatters.ts` - Display name (FirstName L), date/time formatting per PRD 11.9-11.16
- ✅ `states/` - LoadingState, ErrorState (with retry cooldown), EmptyState
- ✅ `FloatingWindow/` - Draggable, resizable window with localStorage persistence
- ✅ `NoteEditor/` - Contenteditable with bold-only formatting, S/M/L/XL font sizes

**Verified:**

- ✅ Fits existing Excalidraw structure (uses same patterns)
- ✅ No unnecessary restructuring (new files only)
- ✅ No extra rich-text features (bold only, 4 sizes only)
- ✅ Reuses existing components (Spinner, Portal hooks)
- ✅ TypeScript compiles with no errors
- ✅ ESLint passes with no errors

---

### Task: Two-Account Demo Setup ⬜ TODO

**PRD Sections:** 14.2, 14.10

**Required:**

- Create two test accounts in Supabase (credentials NOT in code)
- Verify both can join same board
- Verify data isolation (Personal Notes)
- Prepare known-good demo state

---

## Implementation Order (PRD 16.9)

1. ✅ Technical PRD locked
2. ✅ Task 2: Inspect integration points
3. ✅ Implement roomId-to-board_id mapping (Rob's branch merged)
4. ✅ Redesign database migration and RLS (migrations 001-003 drafted)
5. ⬜ **BLOCKED:** Run migrations on Supabase (pending consolidated engineering review - see Migration Files)
6. ✅ Implement Auth Provider & Session Management (frontend complete)
7. ✅ Establish shared frontend infrastructure (Task 4 complete)
8. ⬜ Implement feature work (can parallelize after foundation)
9. ⬜ Verify each feature and security boundary
10. ⬜ Integrated regression testing
11. ⬜ Prepare and rehearse two-account demo

---

## Migration Files

| File | Status | Purpose |
| --- | --- | --- |
| `001_initial_schema.sql` | Ready | profiles, boards, board_memberships, resolve_board() |
| `002_rls_policies.sql` | **Blocked** | RLS policies for foundation tables, profile trigger, is_board_member() |
| `003_feature_tables.sql` | **Blocked** | element_authorship, history_events, personal_notes, team_notes, team_note_viewers + RLS |

**Blocked:** `002_rls_policies.sql` and `003_feature_tables.sql` held pending consolidated engineering review. Engineering review on 9/20 identified RLS/security issues that must be resolved before execution. Do not run or edit either migration until the consolidated review is complete.

---

## Environment Setup Required

To test locally, create `.env.local` file in the **project root** (not excalidraw-app/):

```
VITE_APP_SUPABASE_URL=<your-supabase-url>
VITE_APP_SUPABASE_PUBLISHABLE_KEY=<your-supabase-publishable-key>
```

**Note:** The key format is `sb_publishable_...` (Supabase's newer publishable API key format).

Then run:

```bash
yarn install --ignore-engines
yarn start
```

The `.env.local` file is gitignored and will not be committed.
