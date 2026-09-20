# TASK 2: Supabase Auth Integration Points & Profile Requirements Analysis

**Date:** September 19, 2026
**PRD Sections:** 3.3, 4.1-4.9, 10.12, 11.2
**Status:** Complete

---

## Executive Summary

The existing Excalidraw application has **NO Supabase integration** - it currently uses Firebase for backend services and localStorage for username storage. Identity is currently **not secured** - usernames are stored in localStorage and used purely for display in collaboration. This document identifies where and how to integrate Supabase Auth to provide persistent, secure identity as required by the PRD.

---

## 1. Where the Existing App Can Establish/Restore a Supabase Session

### Recommended Integration Points

| Location | File | Purpose |
|----------|------|---------|
| **App Entry Point** | `excalidraw-app/index.tsx:13-17` | Initialize Supabase client and wrap app with auth provider |
| **App Component** | `excalidraw-app/App.tsx:375` (ExcalidrawWrapper) | Check/restore session before initializing scene |
| **Scene Initialization** | `excalidraw-app/App.tsx:217-373` (initializeScene) | Gate collaboration features on auth state |
| **Hash Change Handler** | `excalidraw-app/App.tsx:570-594` | Preserve board context (roomId) during auth redirect |

### Session Restoration Flow

Per PRD 4.4: "Use the Supabase Auth session. A valid session allows reopen/refresh without reauthentication."

**Recommended implementation:**

1. On app load (`index.tsx` or early in `App.tsx`), call `supabase.auth.getSession()`
2. Subscribe to `supabase.auth.onAuthStateChange()` for session changes
3. Store auth state in Jotai atom (existing pattern: `excalidraw-app/app-jotai.ts`)
4. Clear/reload board-scoped data on auth state change per PRD 12.6

```typescript
// Proposed new atom (similar to existing pattern in Collab.tsx:99-101)
export const supabaseUserAtom = atom<User | null>(null);
export const isAuthenticatedAtom = atom((get) => get(supabaseUserAtom) !== null);
```

---

## 2. Frontend Integration Points for Sign-In/Account Creation

### Key Integration Locations

#### A. Collaboration Entry (Board Link Opening)

- **File**: `excalidraw-app/App.tsx:250` and `excalidraw-app/App.tsx:329-361`
- **Current behavior**: Parses `#room=<roomId>,<roomKey>` and immediately starts collaboration
- **Required change**: If unauthenticated user opens collaboration link, redirect to sign-in while preserving the URL hash
- **PRD 4.1**: "Board-link users who are signed out authenticate and return to the same board context"

#### B. Share Dialog / Start Collaboration

- **File**: `excalidraw-app/share/ShareDialog.tsx:197-207`
- **Current behavior**: `collabAPI.startCollaboration(null)` called directly
- **Required change**: Check authentication before allowing collaboration start
- **PRD 4.1**: "Users authenticate through Supabase before using persistent collaboration features"

#### C. Return-to-Board Behavior

- **File**: `excalidraw-app/App.tsx:570-594` (onHashChange handler)
- **Current behavior**: Scene re-initializes on hash change
- **Required behavior**: After auth completes, restore original `window.location.hash` containing `#room=<roomId>,<roomKey>`

### Proposed Sign-In/Account Creation Component Location

- Create: `excalidraw-app/auth/AuthProvider.tsx` - Context provider for auth state
- Create: `excalidraw-app/auth/AuthDialog.tsx` - Sign-in/sign-up modal
- Create: `excalidraw-app/auth/AuthGuard.tsx` - Higher-order component to gate features

---

## 3. Profile Data Required (Confirmed)

Per **PRD 4.3** and **PRD 9.2**:

| Field | Type | Purpose | PRD Reference |
|-------|------|---------|---------------|
| `user_id` | UUID (FK to auth.users) | Primary identifier, security identity | 3.3, 4.3, 10.12 |
| `first_name` | string | Display name component | 4.3, 4.8 |
| `last_name` | string | Display name component + disambiguation | 4.3, 4.8 |
| `created_at` | timestamptz | Profile creation time | 9.2 |
| `updated_at` | timestamptz | Last profile update | 9.2 |

### Display Name Format (PRD 2.2, 3.3)

- Normal: `{first_name} {last_initial}` (e.g., "Rob W")
- Collision: Reveal additional last-name letters (e.g., "Rob Wa" vs "Rob Wi")
- **No period after initial**

### Account Creation Fields (PRD 4.8)

- First name
- Last name
- Email
- Password (Supabase-managed only)

---

## 4. UUID for Ownership/Actor Fields (Confirmed)

Per **PRD 3.3, 10.12**:

> "Stored ownership and actor fields use Supabase UUIDs, never display names"

> "Security-sensitive ownership and actor values derive from the authenticated Supabase session and are checked against auth.uid()"

### Tables Requiring UUID Ownership/Actor Fields

| Table | Field | Usage |
|-------|-------|-------|
| `profiles` | `user_id` | Links to `auth.users` |
| `board_memberships` | `user_id` | Board membership |
| `element_authorship` | `created_by` | Original element creator |
| `history_events` | `actor_id` / `user_id` | Who performed the action |
| `personal_notes` | `owner_id` | Note owner (RLS enforced) |
| `team_notes` | `author_id` | Note author (permanent) |
| `team_note_viewers` | `user_id` | Selected viewer |

**Critical security rule**: Never store or use Excalidraw display names, emails, or client-supplied user IDs for authorization (PRD 10.12).

---

## 5. Distinction: Excalidraw Collaborator Identity vs. Supabase Auth

### Current Excalidraw Identity (NOT SECURE)

**File**: `excalidraw-app/data/localStorage.ts:11-35`

```typescript
// Current: Username stored in localStorage
export const saveUsernameToLocalStorage = (username: string) => {
  localStorage.setItem(STORAGE_KEYS.LOCAL_STORAGE_COLLAB, JSON.stringify({ username }));
};
```

**File**: `excalidraw-app/collab/Collab.tsx:102-109, 1026-1034`

```typescript
// Collaborator state only contains username (no secure identity)
interface CollabState {
  username: string;  // This is just a display string!
  // ...
}
```

**Key observation**: The `username` in Collab.tsx state and the `Collaborator` type are purely **display purposes**:

- Set via localStorage or random generation (`@excalidraw/random-username`)
- Transmitted via WebSocket to show cursor labels
- **Has no connection to any authentication system**
- **Must NOT be used for security identity** (PRD 10.12)

### Required Separation

| Aspect | Excalidraw Collaborator | Supabase Auth |
|--------|------------------------|---------------|
| **Purpose** | Real-time cursor/presence display | Security identity & authorization |
| **Storage** | In-memory, localStorage | Supabase auth.users + profiles table |
| **Identifier** | Socket ID + username string | UUID (auth.uid()) |
| **Mutable** | Yes (user can change anytime) | No (UUID permanent, names updateable) |
| **Security** | None (UX only) | RLS-enforced |

### Integration Approach

The Supabase user profile should **populate** the Excalidraw collaborator username, but they remain separate:

```typescript
// Pseudocode for integration
const supabaseProfile = await getProfile(supabase.auth.getUser().id);
const displayName = formatDisplayName(supabaseProfile.first_name, supabaseProfile.last_name);
collabAPI.setUsername(displayName);  // Sets the display string
```

For persistence operations, **always use `auth.uid()`**, never the display username.

---

## 6. Session Restoration and Sign-Out Locations

### Session Restoration

| Event | Location | Required Action |
|-------|----------|-----------------|
| App load | `index.tsx` / `App.tsx` init | `supabase.auth.getSession()` → restore or redirect |
| Tab focus | `App.tsx:660-670` (visibilityChange) | Verify session still valid |
| Hash change | `App.tsx:570-594` | Check auth before loading board data |

### Sign-Out

| Location | Current Code | Required Change |
|----------|--------------|-----------------|
| (NEW) | N/A | Add sign-out button in AppMainMenu |
| Sign-out action | N/A | `await supabase.auth.signOut()` |
| Post sign-out | N/A | Clear UI state, remove private data per PRD 4.5, 12.6 |

**PRD 4.5**: "Sign-out ends the Supabase session and removes authenticated private/restricted data from visible UI. It does not delete membership, authorship, History, Personal Notes, or Team Notes."

---

## 7. Verification: Two Authenticated Users Can Be Distinguished

### How the System Will Distinguish Users

1. **Supabase Auth provides distinct UUIDs**: Each authenticated user has a unique `auth.uid()`
2. **RLS policies check `auth.uid()`**: All board-scoped queries filter by authenticated user
3. **Display names resolved from profiles**: UUID → profile lookup → "Rob W" or "Christina R"
4. **Collision handling**: Same first name + last initial → reveal more last name letters

### Test Scenario

- User A: UUID `uuid-a`, profile: "Rob Williams" → displays "Rob W"
- User B: UUID `uuid-b`, profile: "Rob Wilson" → displays "Rob Wi" (collision resolved)
- Same board: Both are members, each sees the other's contributions
- Personal Notes: User A's notes invisible to User B (RLS: `owner_id = auth.uid()`)

---

## 8. Files Requiring Modification for Supabase Integration

### New Files to Create

| File | Purpose |
|------|---------|
| `excalidraw-app/supabase/client.ts` | Supabase client initialization |
| `excalidraw-app/supabase/auth.ts` | Auth helper functions |
| `excalidraw-app/auth/AuthProvider.tsx` | React context for auth state |
| `excalidraw-app/auth/AuthDialog.tsx` | Sign-in/sign-up UI |
| `excalidraw-app/auth/ProfileForm.tsx` | Account creation form |
| `excalidraw-app/hooks/useSupabaseAuth.ts` | Auth state hook |

### Existing Files to Modify

| File | Change |
|------|--------|
| `.env.development` | Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` |
| `excalidraw-app/index.tsx` | Initialize Supabase, wrap with AuthProvider |
| `excalidraw-app/App.tsx` | Auth state checks, gate collaboration on auth |
| `excalidraw-app/collab/Collab.tsx` | Link Supabase profile to collaborator username |
| `excalidraw-app/share/ShareDialog.tsx` | Auth check before start collaboration |
| `excalidraw-app/data/localStorage.ts` | Keep for backward compat, but profile from Supabase |
| `excalidraw-app/app_constants.ts` | Add Supabase storage keys |

---

## 9. Environment Variables Required (No Hard-Coded Secrets)

Per **PRD 10.14, 11.2**: "Never expose service-role or equivalent RLS-bypass credentials in the browser"

### .env.development additions

```env
# Supabase - public client config only (anon key is designed for browser use)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...  # Public anon key only

# DO NOT add service_role key here - that's server-side only
```

### .env.local (gitignored, for development)

```env
# Developer-specific overrides
# Demo account credentials should NEVER be here
```

---

## 10. Board Identity: roomId vs. roomKey

### Current URL Parsing

**File**: `excalidraw-app/data/index.ts:131-146`

```typescript
const RE_COLLAB_LINK = /^#room=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/;

export const getCollaborationLinkData = (link: string) => {
  const hash = new URL(link).hash;
  const match = hash.match(RE_COLLAB_LINK);
  if (match && match[2].length !== 22) {
    window.alert(t("alerts.invalidEncryptionKey"));
    return null;
  }
  return match ? { roomId: match[1], roomKey: match[2] } : null;
};
```

### PRD Requirements (3.2, 9.3)

- **roomId**: External stable reference → maps to internal Supabase `board_id`
- **roomKey**: Encryption material → **NEVER store in Supabase**
- Store only `roomId` in the `boards` table with uniqueness constraint
- Internal `board_id` (UUID) is the primary key for all board-scoped data

---

## Summary: Integration Readiness Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| Session establish/restore points identified | ✅ | App init, hash change, visibility change |
| Sign-in/account creation integration points | ✅ | ShareDialog, board link entry, new AuthDialog |
| Profile data: first_name, last_name | ✅ | Per PRD 4.3, 4.8, 9.2 |
| UUID for ownership/actor fields | ✅ | Per PRD 3.3, 10.12 |
| No hard-coded credentials | ✅ | Env vars only, no secrets in code |
| Excalidraw identity ≠ security identity | ✅ | Display username separate from auth.uid() |
| Two-user distinction possible | ✅ | Via distinct UUIDs + RLS |
| Sign-out location identified | ✅ | New menu item needed |
| roomId/roomKey separation understood | ✅ | Only roomId stored, roomKey never persisted |

---

## Unlocks

This analysis enables:

- Profile/membership implementation
- Authenticated feature data access
- Prepared two-account demo setup

---

## References

- PRD Section 3.3: Authenticated User Identity
- PRD Section 4.1-4.9: Identity & Authentication
- PRD Section 10.12: Authenticated Identity Enforcement
- PRD Section 11.2: Frontend Authentication Integration
