/**
 * Pure decision logic for Element Authorship attribution.
 *
 * An element is attributed to the local user ONLY when it is a trustworthy
 * local creation: its id is neither in the set of previously-seen ids nor in
 * the set of ids that arrived via remote scene updates. Remote-originated,
 * initial, and imported elements are never guessed (PRD 5.7).
 *
 * Kept free of network/supabase imports so it can be unit-tested and reused
 * by the collaboration verification evidence.
 */

export const computeAuthorshipCandidates = (
  currentIds: ReadonlySet<string>,
  knownElementIds: ReadonlySet<string> | null,
  remoteReceivedElementIds: ReadonlySet<string>,
): { isInitialBaseline: boolean; candidateElementIds: string[] } => {
  if (knownElementIds === null) {
    // First observation: this is the initial scene load. Existing/imported
    // elements are not attributed (PRD 5.7).
    return { isInitialBaseline: true, candidateElementIds: [] };
  }

  const candidateElementIds: string[] = [];
  for (const id of currentIds) {
    if (!knownElementIds.has(id) && !remoteReceivedElementIds.has(id)) {
      candidateElementIds.push(id);
    }
  }
  return { isInitialBaseline: false, candidateElementIds };
};
