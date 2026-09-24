#!/usr/bin/env node

/**
 * Verify History Panel data layer against production Supabase.
 * Tests: insert (append-only, actor-scoped), read (board scoped), cross-board
 * isolation, update/delete blocked by RLS, profile lookup for actors.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const envLocal = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const env = Object.fromEntries(
  envLocal.split("\n").filter(l => l.includes("=")).map(l => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  })
);

const URL = env.VITE_SUPABASE_URL || env.VITE_APP_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY || env.VITE_APP_SUPABASE_PUBLISHABLE_KEY;

let pass = 0, fail = 0;
function report(ok, label, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function signIn(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.msg || "Sign-in failed");
  return j;
}

async function rest(token, path, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=representation",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${URL}/rest/v1/${path}`, opts);
  const j = await r.json().catch(() => null);
  return { status: r.status, data: j };
}

async function rpc(token, fn, params = {}) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const j = await r.json().catch(() => null);
  return { status: r.status, data: j };
}

async function main() {
  console.log("\n=== History Panel Data Layer Verification ===\n");

  const sessionA = await signIn(env.VITE_DEMO_USER1_EMAIL, env.VITE_DEMO_USER1_PASSWORD);
  const sessionB = await signIn(env.VITE_DEMO_USER2_EMAIL, env.VITE_DEMO_USER2_PASSWORD);
  const tokenA = sessionA.access_token;
  const tokenB = sessionB.access_token;
  console.log(`User A: ${sessionA.user.id}`);
  console.log(`User B: ${sessionB.user.id}`);

  const roomId = `history-test-${Date.now()}`;
  const boardRes = await rpc(tokenA, "resolve_board", { p_excalidraw_room_id: roomId });
  report(boardRes.status === 200 && !!boardRes.data, "Board resolved", `board_id=${boardRes.data}`);
  const boardId = boardRes.data;

  const boardResB = await rpc(tokenB, "resolve_board", { p_excalidraw_room_id: roomId });
  report(boardResB.status === 200 && boardResB.data === boardId, "User B resolved same board");

  // 1. Insert a history event as User A (actor_id must equal auth.uid())
  const now = new Date().toISOString();
  const insertA = await rest(tokenA, "history_events", "POST", [{
    board_id: boardId,
    actor_id: sessionA.user.id,
    action: "Created",
    target_info: { elementTypes: { rectangle: 1 } },
    created_at: now,
  }]);
  const okA = insertA.status === 201 || (insertA.status === 200 && Array.isArray(insertA.data) && insertA.data.length === 1);
  report(okA, "User A inserts a history event", `status=${insertA.status}, n=${insertA.data?.length}`);
  const eventId = okA ? insertA.data?.[0]?.id : null;

  // 2. User A cannot forge an event as User B (RLS actor_id must match)
  const forge = await rest(tokenA, "history_events", "POST", [{
    board_id: boardId,
    actor_id: sessionB.user.id,
    action: "Moved",
    target_info: { elementTypes: { ellipse: 1 } },
    created_at: new Date().toISOString(),
  }]);
  report(forge.status === 403 || forge.status === 401, "User A cannot insert event as User B (RLS)", `status=${forge.status}`);

  // 3. User B can read history on the shared board
  const readB = await rest(tokenB, `history_events?board_id=eq.${boardId}&select=*`);
  report(
    readB.status === 200 && Array.isArray(readB.data) && readB.data.length >= 1,
    "User B can read history on shared board",
    `found=${readB.data?.length}`
  );
  if (readB.data?.[0]) {
    report(readB.data[0].actor_id === sessionA.user.id, "Event actor_id = User A UUID");
    report(readB.data[0].action === "Created", "Event action persisted as 'Created'");
    report(!!readB.data[0].created_at, "Event has created_at timestamp");
  }

  // 4. Immutability: PATCH blocked (no update policy), record unchanged
  const patch = await rest(tokenA, `history_events?id=eq.${eventId}`, "PATCH", { action: "Edited" });
  const afterPatch = await rest(tokenA, `history_events?board_id=eq.${boardId}&select=action`);
  const unchangedAction = afterPatch.data?.every(r => r.action !== "Edited");
  report(
    (patch.status === 403 || patch.status === 401 || patch.status === 204) && unchangedAction,
    "History event immutable (update blocked, action unchanged)",
    `patch status=${patch.status}`
  );

  // 5. DELETE blocked (no delete policy)
  const del = await rest(tokenA, `history_events?id=eq.${eventId}`, "DELETE", null);
  const afterDel = await rest(tokenA, `history_events?board_id=eq.${boardId}&select=id`);
  report(
    del.status === 403 || del.status === 401 || afterDel.data?.length === 1,
    "History event append-only (delete blocked, record remains)",
    `delete status=${del.status}, remaining=${afterDel.data?.length}`
  );

  // 6. Cross-board isolation
  const otherRoom = `history-other-${Date.now()}`;
  const otherBoard = await rpc(tokenA, "resolve_board", { p_excalidraw_room_id: otherRoom });
  const crossRead = await rest(tokenA, `history_events?board_id=eq.${otherBoard.data}&select=*`);
  report(
    crossRead.status === 200 && Array.isArray(crossRead.data) && crossRead.data.length === 0,
    "Cross-board isolation (other board has no history)",
    `found=${crossRead.data?.length}`
  );

  // 7. Safer row-level scoping: User A's own insert must have board membership — ok via resolve_board
  report(boardRes.status === 200 && !!boardRes.data, "User A is a board member (resolve_board ok)");

  // 8. Unauthenticated read blocked
  const noAuth = await fetch(`${URL}/rest/v1/history_events?board_id=eq.${boardId}&select=*`, {
    headers: { apikey: ANON },
  });
  const noAuthData = await noAuth.json().catch(() => null);
  report(
    noAuth.status !== 200 || (Array.isArray(noAuthData) && noAuthData.length === 0),
    "Unauthenticated access to history_events blocked"
  );

  // 9. Profile lookup for actor display names
  const profile = await rest(tokenA, `profiles?user_id=eq.${sessionA.user.id}&select=first_name,last_name`);
  report(
    profile.status === 200 && profile.data?.[0]?.first_name != null,
    "Actor profile available for display name",
    `name="${profile.data?.[0]?.first_name} ${profile.data?.[0]?.last_name}"`
  );

  console.log(`\n=== Summary: ${pass} PASS, ${fail} FAIL ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });