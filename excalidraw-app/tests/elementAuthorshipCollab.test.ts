import { describe, expect, it } from "vitest";

import { computeAuthorshipCandidates } from "../data/authorshipDecision";

/**
 * PRD 5.x collaborative-authority test: an element that arrives via a remote
 * scene update must never be attributed to the recipient user.
 *
 * Simulates the two-user flow:
 *   alice creates E1 -> alice attributed (local creation)
 *   bob receives E1 via remote scene update -> bob NOT attributed
 *   bob creates E2 -> bob attributed (local creation)
 */
describe("Element Authorship — collaborative safety", () => {
  it("attributes only local creations, never remote-received elements", () => {
    const remoteReceived = new Set<string>();

    // --- alice creates E1 (no known ids yet -> initial baseline on first call,
    //     then the creation is observed as a candidate on the next change) ---
    const aliceKnown = new Set<string>();
    const aliceObserved = computeAuthorshipCandidates(
      new Set(["E1"]),
      aliceKnown,
      remoteReceived,
    );
    expect(aliceObserved.isInitialBaseline).toBe(false);
    expect(aliceObserved.candidateElementIds).toEqual(["E1"]);
    aliceKnown.add("E1");

    // --- bob receives a remote scene update containing E1 ---
    const bobKnown = new Set<string>();
    // E1 arrives via remote scene update -> added to bob's remote set
    remoteReceived.add("E1");

    const bobFirst = computeAuthorshipCandidates(
      new Set(["E1"]),
      bobKnown,
      remoteReceived,
    );
    expect(bobFirst.candidateElementIds).toEqual([]);
    // bob records E1 as seen but must never claim authorship
    bobKnown.add("E1");

    // --- bob creates E2 locally ---
    const bobSecond = computeAuthorshipCandidates(
      new Set(["E1", "E2"]),
      bobKnown,
      remoteReceived,
    );
    expect(bobSecond.candidateElementIds).toEqual(["E2"]);

    // --- subsequent observation of E2: no repeat attribution ---
    bobKnown.add("E2");
    const bobThird = computeAuthorshipCandidates(
      new Set(["E1", "E2"]),
      bobKnown,
      remoteReceived,
    );
    expect(bobThird.candidateElementIds).toEqual([]);

    // Invariant: E1 was attributed to alice and to no one else.
    expect(aliceKnown.has("E1")).toBe(true);
    expect(aliceObserved.candidateElementIds).not.toContain("E2");
  });

  it("never guesses authorship for the initial scene load", () => {
    const remoteReceived = new Set<string>(["existing-a", "existing-b"]);

    // First-ever observation (known ids null): baseline, no attribution.
    const baseline = computeAuthorshipCandidates(
      new Set(["existing-a", "existing-b"]),
      null,
      remoteReceived,
    );
    expect(baseline.isInitialBaseline).toBe(true);
    expect(baseline.candidateElementIds).toEqual([]);
  });
});
