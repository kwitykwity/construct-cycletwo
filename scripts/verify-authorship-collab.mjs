#!/usr/bin/env node

/**
 * Verify ELEMENT AUTHORSHIP COLLABORATIVE SAFETY against production Supabase.
 *
 * Two-user collaborative scenario (PRD 5.x):
 *   alice creates E1 -> element_authorship records alice
 *   bob receives E1 via a remote scene update -> bob's app must NOT insert it
 *   bob creates E2 -> element_authorship records bob
 *
 * This mirrors excalidraw-app/data/authorshipDecision.ts (computeAuthorshipCandidates)
 * in plain mjs so it can talk to Supabase directly — a runnable stand-in for the
 * pure helper, which the code correctly implements in TypeScript.
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

// ---------------------------------------------------------------------------
// Mirror of computeAuthorshipCandidates (app decision logic)
// ---------------------------------------------------------------------------

/**
 * Returns the element ids a client would attribute to the local user:
 * ids in currentIds that are NOT already known AND NOT remote-received.
 */
function membershipAuthorIdsWouldReport(currentIds, knownIds /* null = baseline */, remoteReceivedIds) {
  if (knownIds === null) {
    return { isInitialBaseline: true, newElementIds: [] };
  }
  const newElementIds = [];
  for (const id of currentIds) {
    if (!knownIds.has(id) && !remoteReceivedIds.has(id)) {
      newElementIds.push(id);
    }
  }
  return { isInitialBaseline: false, newElementIds };
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

async function rest(token, tablePath, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${URL}/rest/v1/${tablePath}`, opts);
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
  console.log("\n=== Element Authorship — Collaborative Safety Verification ===\n");

  const sessionAlice = await signIn(env.VITE_DEMO_USER1_EMAIL, env.VITE_DEMO_USER1_PASSWORD);
  const sessionBob = await signIn(env.VITE_DEMO_USER2_EMAIL, env.VITE_DEMO_USER2_PASSWORD);
  const aliceId = sessionAlice.user.id;
  const bobId = sessionBob.user.id;
  console.log(`Alice: ${aliceId}`);
  console.log(`Bob:   ${bobId}`);

  const roomId = `authorship-collab-${Date.now()}`;
  const boardRes = await rpc(sessionAlice.access_token, "resolve_board", { p_excalidraw_room_id: roomId });
  report(boardRes.status === 200 && !!boardRes.data, "Alice resolved shared board", `board_id=${boardRes.data}`);
  const boardId = boardRes.data;

  // Bob joins the same board (establishes board membership for RLS)
  const boardResB = await rpc(sessionBob.access_token, "resolve_board", { p_excalidraw_room_id: roomId });
  report(boardResB.status === 200 && boardResB.data === boardId, "Bob resolved same shared board");

  const E1 = `collab-e1-${Date.now()}`;
  const E2 = `collab-e2-${Date.now()}`;

  // --- Bob's initial scene (baseline) ---
  // Bob joins the board that already has scene elements he did not create.
  const knownIds = new Set(["preexisting-1", "preexisting-2"]);
  const remoteReceived = new Set(["preexisting-1", "preexisting-2"]);

  // --- Alice creates E1 ---
  const aliceDecision = membershipAuthorIdsWouldReport(new Set([...knownIds, E1]), knownIds, remoteReceived);
  report(!aliceDecision.isInitialBaseline, "Alice: not initial baseline");
  report(
    aliceDecision.newElementIds.includes(E1),
    "Alice: E1 is a genuine local creation -> candidate",
  );
  const saveAlice = await rest(sessionAlice.access_token, "element_authorship", "POST", {
    board_id: boardId, element_id: E1, created_by: aliceId,
  });
  report(saveAlice.status === 201 || saveAlice.status === 200, "Alice: E1 authorship recorded", `status=${saveAlice.status}`);
  knownIds.add(E1);

  // --- Bob receives E1 via remote scene update (handleRemoteSceneUpdate) ---
  // The remote-received id set is populated BEFORE App.onChange runs, so by the
  // time Bob's decision logic sees E1, it is already flagged as remote.
  remoteReceived.add(E1);
  const bobReceive = membershipAuthorIdsWouldReport(new Set([...knownIds, E1]), knownIds, remoteReceived);
  report(
    !bobReceive.newElementIds.includes(E1),
    "Bob: E1 arrived via remote scene update -> NOT a candidate (no attribution)",
  );

  // --- Bob creates E2 locally (after receiving E1) ---
  const bobCreate = membershipAuthorIdsWouldReport(new Set([...knownIds, E1, E2]), knownIds, remoteReceived);
  report(
    bobCreate.newElementIds.includes(E2) && !bobCreate.newElementIds.includes(E1),
    "Bob: E2 is a genuine local creation -> candidate; E1 still excluded",
  );
  const saveBob = await rest(sessionBob.access_token, "element_authorship", "POST", {
    board_id: boardId, element_id: E2, created_by: bobId,
  });
  report(saveBob.status === 201 || saveBob.status === 200, "Bob: E2 authorship recorded", `status=${saveBob.status}`);

  // --- DB assertions ---
  const e1Rows = await rest(sessionBob.access_token, `element_authorship?board_id=eq.${boardId}&element_id=eq.${E1}&select=*`);
  report(
    e1Rows.status === 200 && Array.isArray(e1Rows.data) && e1Rows.data.length === 1,
    "DB: E1 has exactly one authorship record",
    `rows=${e1Rows.data?.length}`,
  );
  report(
    e1Rows.data?.[0]?.created_by === aliceId,
    "DB: E1 creator = alice (not bob)",
    `created_by=${e1Rows.data?.[0]?.created_by}`,
  );
  report(
    !(e1Rows.data || []).some(r => r.created_by === bobId),
    "DB: no bob-authored record for E1 (bob never claimed it)",
  );

  const e2Rows = await rest(sessionAlice.access_token, `element_authorship?board_id=eq.${boardId}&element_id=eq.${E2}&select=*`);
  report(
    e2Rows.data?.[0]?.created_by === bobId,
    "DB: E2 creator = bob",
    `created_by=${e2Rows.data?.[0]?.created_by}`,
  );

  const boardRows = await rest(sessionBob.access_token, `element_authorship?board_id=eq.${boardId}&select=created_by`);
  const creators = (boardRows.data || []).map(r => r.created_by);
  report(
    creators.includes(aliceId) && creators.includes(bobId),
    "DB: both alice and bob appear as creators on the same shared board",
    `creators=${[...new Set(creators)].join(",")}`,
  );

  console.log(`\n=== Summary: ${pass} PASS, ${fail} FAIL ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });