import { supabase } from "./supabase";

/**
 * Element Authorship persistence.
 *
 * Per PRD Section 5:
 * - Records original creator UUID and creation timestamp
 * - Scoped to the current resolved board_id
 * - Authorship is immutable — never transferred on modification
 * - Duplicated elements get new authorship for the duplicating user
 * - Existing/imported elements without trustworthy authorship are left alone
 * - Persistence failure must not break the Excalidraw element
 */

export interface ElementAuthorship {
  elementId: string;
  boardId: string;
  createdBy: string;
  createdAt: string;
}

/**
 * Persist authorship for a newly created element.
 * Silently fails — a valid Excalidraw element must never be broken
 * by a collaboration-layer persistence failure (PRD 5.6).
 */
export const saveElementAuthorship = async (
  boardId: string,
  elementId: string,
  createdBy: string,
): Promise<void> => {
  try {
    const { error } = await supabase.from("element_authorship").insert({
      board_id: boardId,
      element_id: elementId,
      created_by: createdBy,
    });

    if (error) {
      // Unique constraint violation is fine — authorship already recorded
      if (error.code === "23505") {
        return;
      }
      console.warn("Could not save element authorship:", error.message);
    }
  } catch (err) {
    console.warn("Element authorship persistence failed:", err);
  }
};

/**
 * Persist authorship for multiple elements at once (batch).
 */
export const saveElementAuthorshipBatch = async (
  boardId: string,
  elements: { elementId: string; createdBy: string }[],
): Promise<void> => {
  if (elements.length === 0) {
    return;
  }

  try {
    const rows = elements.map((el) => ({
      board_id: boardId,
      element_id: el.elementId,
      created_by: el.createdBy,
    }));

    const { error } = await supabase.from("element_authorship").upsert(rows, {
      onConflict: "board_id,element_id",
      ignoreDuplicates: true,
    });

    if (error) {
      console.warn("Could not batch-save element authorship:", error.message);
    }
  } catch (err) {
    console.warn("Element authorship batch persistence failed:", err);
  }
};

/**
 * Load authorship records for a set of element IDs on a board.
 * Returns a map of elementId -> authorship record.
 */
export const loadElementAuthorships = async (
  boardId: string,
  elementIds: string[],
): Promise<Map<string, { createdBy: string; createdAt: string }>> => {
  const map = new Map<string, { createdBy: string; createdAt: string }>();

  if (elementIds.length === 0) {
    return map;
  }

  try {
    const { data, error } = await supabase
      .from("element_authorship")
      .select("element_id, created_by, created_at")
      .eq("board_id", boardId)
      .in("element_id", elementIds);

    if (error) {
      console.warn("Could not load element authorships:", error.message);
      return map;
    }

    if (data) {
      for (const row of data) {
        map.set(row.element_id, {
          createdBy: row.created_by,
          createdAt: row.created_at,
        });
      }
    }
  } catch (err) {
    console.warn("Element authorship load failed:", err);
  }

  return map;
};
