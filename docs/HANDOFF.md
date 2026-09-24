# Construct Cycle Two — Session Handoff

**Client:** Victoria
**Team:** Christina, Naquan, Rob, Sal, Trevor
**Date:** September 2026

---

## What was built

An **Excalidraw Collaboration & Handoff** tool. Two people can open the same shared whiteboard link, sign in, and leave a **Session Handoff** for each other — four plain fields that answer:

1. **Where we left off**
2. **What's next**
3. **Owner**
4. **Timestamp** (auto-generated)

When someone reopens the board, the handoff opens automatically so they know exactly where to pick up.

---

## What works today

| Feature | Status |
|---------|--------|
| Sign in / Sign up with email & password | Working |
| Session restored on page reload (no re-login) | Working |
| Shared board via collaboration link | Working |
| Board resolved to a stable internal ID | Working |
| Two users on the same board, distinct identities | Working |
| Session Handoff save / reload / auto-open | Working |
| Handoff persisted in Supabase (shared across browsers) | Working |
| Row Level Security (RLS) on all tables | Working |
| Cross-user profile writes blocked | Working |
| Personal Notes private to owner | Working |
| Cross-board data isolation | Working |
| No credentials or secrets in source code | Working |

---

## What is NOT in this MVP

These were part of the broader technical PRD but are not in the client-approved MVP:

- Element Authorship (hover to see who created an element)
- History Panel (activity log of board changes)
- Personal Notes (private per-user notes)
- Team Notes (shared notes with visibility controls)

---

## How to run locally

### Prerequisites

- Node.js 18+
- Yarn
- Two terminal windows

### 1. Clone and install

```bash
git clone https://github.com/kwitykwity/construct-cycletwo.git
cd construct-cycletwo
yarn install --ignore-engines
```

### 2. Set up environment variables

Create a `.env.local` file in the **project root** (not inside `excalidraw-app/`):

```
VITE_APP_SUPABASE_URL=<your-supabase-project-url>
VITE_APP_SUPABASE_PUBLISHABLE_KEY=<your-supabase-publishable-key>
```

**Important:** Without these two variables the app will show a white screen — not just the new features.

The publishable key format is `sb_publishable_...` (Supabase's newer key format). Find both values in your Supabase dashboard under Project Settings → API.

### 3. Start the WebSocket collaboration server

Local realtime collaboration requires the `excalidraw-room` WebSocket server running on port **3002**:

```bash
# In a separate terminal
git clone https://github.com/excalidraw/excalidraw-room.git
cd excalidraw-room
yarn install
yarn start
# Should be listening on :3002
```

The app's development environment (`.env.development`) already points to `http://localhost:3002` for WebSocket connections.

### 4. Start the app

```bash
# Back in the construct-cycletwo directory
yarn start
# App runs on http://localhost:3001
```

### 5. Test the Session Handoff

1. Open `http://localhost:3001`
2. Sign in (or create an account)
3. Start a collaboration room (share the link)
4. Click the **Handoff** button (top-right area)
5. Fill in the fields and click **Save handoff**
6. Reload the page — the handoff opens automatically with your saved content

---

## How to verify two-user collaboration

1. Open the collaboration link in two different browsers (or one browser + incognito)
2. Sign in as different users in each
3. User A saves a handoff
4. User B reloads the page — sees User A's handoff content
5. User B edits and saves — User A sees the update on next reload

---

## Architecture at a glance

```
Browser (Excalidraw app)
  ├── Excalidraw canvas (existing, untouched)
  ├── Auth (Supabase Auth: email/password sign-in)
  ├── Board resolution (roomId → Supabase board_id via RPC)
  ├── Session Handoff (Supabase table, one per board)
  └── WebSocket realtime (excalidraw-room on :3002)

Supabase (cloud)
  ├── auth.users (identity)
  ├── profiles (first_name, last_name)
  ├── boards (stable board_id, mapped from Excalidraw roomId)
  ├── board_memberships (who belongs to which board)
  ├── session_handoffs (the handoff content)
  └── RLS policies (security boundary on all tables)
```

---

## Known limitations

| Limitation | Detail |
|-----------|--------|
| **Auth recovery** | No "forgot password" flow. If a user forgets their password, an admin must reset it in the Supabase dashboard. |
| **Sign-out is client-side** | Signing out clears the browser session but does not invalidate the token server-side. The token expires naturally. |
| **Browser-local fallback removed** | With the `session_handoffs` table now applied, handoffs are always saved to Supabase. The browser-local fallback no longer applies for signed-in users. |
| **No realtime for Handoff** | Handoff changes appear on next page load/reload, not instantly. |
| **No membership admin** | No way to remove a user from a board or manage members through the UI. |
| **Demo/test data** | A personal note owned by a test account and a board row for `qa-isolation-test-room-01` remain in the database from verification testing. |

---

## Environment variables reference

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_APP_SUPABASE_URL` | `.env.local` | Supabase project URL |
| `VITE_APP_SUPABASE_PUBLISHABLE_KEY` | `.env.local` | Supabase publishable (anon) key |
| `VITE_APP_WS_SERVER_URL` | `.env.development` | WebSocket server for collaboration (default: `http://localhost:3002`) |
| `VITE_APP_PORT` | `.env.development` | Dev server port (default: `3001`) |

**Never commit `.env.local` or any file containing secrets.** All `.env*.local` files are in `.gitignore`.

---

## Repository

- **GitHub:** `https://github.com/kwitykwity/construct-cycletwo`
- **Supabase project:** `nboqhzztdccouamrgsmk`

If your clone has an old remote URL, update it:

```bash
git remote set-url origin https://github.com/kwitykwity/construct-cycletwo.git
```
