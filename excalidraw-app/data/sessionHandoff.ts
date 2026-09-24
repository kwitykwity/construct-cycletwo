import { supabase } from "./supabase";

/**
 * Session Handoff persistence (client PRD: Session Handoff MVP).
 *
 * Four fields only: where we left off, what's next, owner, timestamp.
 *
 * Storage is the board-scoped `session_handoffs` table, keyed by the internal
 * Supabase board_id resolved from the Excalidraw roomId.
 *
 * Saving fails closed: on a collaborative board (a board_id exists), a failed
 * Supabase write throws rather than quietly writing a browser-local copy, so the
 * UI never reports a handoff as saved when collaborators cannot see it. The
 * browser-local path is used only when there is no board_id at all - signed out,
 * or not in a collaborative session - and `storage` says which path was used.
 */

export interface SessionHandoff {
  leftOff: string;
  whatsNext: string;
  ownerName: string;
  updatedAt: string;
  updatedByName: string;
  storage: "supabase" | "local";
}

export type SessionHandoffDraft = Pick<
  SessionHandoff,
  "leftOff" | "whatsNext" | "ownerName"
>;

const LOCAL_KEY_PREFIX = "excalidraw-session-handoff-";

const localKey = (roomId: string | null) =>
  `${LOCAL_KEY_PREFIX}${roomId ?? "local"}`;

const readLocal = (roomId: string | null): SessionHandoff | null => {
  try {
    const raw = localStorage.getItem(localKey(roomId));
    return raw ? (JSON.parse(raw) as SessionHandoff) : null;
  } catch (error) {
    console.warn("Could not read local handoff:", error);
    return null;
  }
};

const writeLocal = (
  roomId: string | null,
  handoff: SessionHandoff,
): SessionHandoff => {
  try {
    localStorage.setItem(localKey(roomId), JSON.stringify(handoff));
  } catch (error) {
    console.warn("Could not save local handoff:", error);
  }
  return handoff;
};

export const loadSessionHandoff = async (
  boardId: string | null,
  roomId: string | null,
): Promise<SessionHandoff | null> => {
  if (boardId) {
    try {
      const { data, error } = await supabase
        .from("session_handoffs")
        .select("left_off, whats_next, owner_name, updated_at, updated_by_name")
        .eq("board_id", boardId)
        .maybeSingle();

      if (!error && data) {
        return {
          leftOff: data.left_off ?? "",
          whatsNext: data.whats_next ?? "",
          ownerName: data.owner_name ?? "",
          updatedAt: data.updated_at,
          updatedByName: data.updated_by_name ?? "",
          storage: "supabase",
        };
      }
      if (!error) {
        return null;
      }
      console.warn("Handoff unavailable from Supabase:", error.message);
    } catch (error) {
      console.warn("Handoff lookup failed:", error);
    }
  }

  return readLocal(roomId);
};

export const saveSessionHandoff = async (
  boardId: string | null,
  roomId: string | null,
  draft: SessionHandoffDraft,
  updatedByName: string,
): Promise<SessionHandoff> => {
  const updatedAt = new Date().toISOString();

  // Collaborative board: the handoff must reach collaborators, so any failure
  // is surfaced instead of being downgraded to a browser-local copy.
  if (boardId) {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;

    if (!userId) {
      throw new Error("Cannot save a shared handoff while signed out.");
    }

    const { error } = await supabase.from("session_handoffs").upsert(
      {
        board_id: boardId,
        left_off: draft.leftOff,
        whats_next: draft.whatsNext,
        owner_name: draft.ownerName,
        updated_by: userId,
        updated_by_name: updatedByName,
        updated_at: updatedAt,
      },
      { onConflict: "board_id" },
    );

    if (error) {
      throw new Error(`Could not save shared handoff: ${error.message}`);
    }

    return { ...draft, updatedAt, updatedByName, storage: "supabase" };
  }

  return writeLocal(roomId, {
    ...draft,
    updatedAt,
    updatedByName,
    storage: "local",
  });
};
