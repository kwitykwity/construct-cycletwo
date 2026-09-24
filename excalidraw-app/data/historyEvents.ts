import { supabase } from "./supabase";

import type { HistoryAction } from "./historyTracker";

/**
 * History event persistence (History Panel vertical slice).
 *
 * Append-only by design: history_events has SELECT and INSERT policies only
 * (board members may read their board's events and insert their own). No
 * client update or delete behavior exists here.
 *
 * Data is scoped to the resolved board_id. roomKey is never involved.
 */

export interface HistoryEvent {
  id: string;
  boardId: string;
  actorId: string;
  action: HistoryAction;
  elementTypes: Record<string, number> | null;
  createdAt: string;
}

export interface PendingHistoryEvent {
  action: HistoryAction;
  elementTypes: Record<string, number>;
}

const ACTION_OF =
  /^(Created|Edited|Moved|Resized|Deleted|Duplicated|Grouped|Ungrouped|Locked|Unlocked|Reordered|Reorganized)$/;

const mapRow = (row: Record<string, unknown>): HistoryEvent => ({
  id: String(row.id),
  boardId: String(row.board_id),
  actorId: String(row.actor_id),
  action: (typeof row.action === "string" && ACTION_OF.test(row.action)
    ? row.action
    : "Edited") as HistoryAction,
  elementTypes:
    row.target_info && typeof row.target_info === "object"
      ? ((row.target_info as Record<string, unknown>).elementTypes as Record<
          string,
          number
        > | null) ?? null
      : null,
  createdAt: String(row.created_at),
});

/**
 * Persist a batch of history events. Fire-and-forget from the caller's
 * perspective - callers catch and swallow errors; a failed write must never
 * break normal board operation.
 */
export async function saveHistoryEvents(
  boardId: string,
  actorId: string,
  events: PendingHistoryEvent[],
): Promise<void> {
  if (events.length === 0) {
    return;
  }
  const { error } = await supabase.from("history_events").insert(
    events.map((event) => ({
      board_id: boardId,
      actor_id: actorId,
      action: event.action,
      target_info: { elementTypes: event.elementTypes },
    })),
  );
  if (error) {
    throw new Error(`Could not save history events: ${error.message}`);
  }
}

/**
 * Load up to `limit` history events for a board, newest first. RLS already
 * restricts this to events on boards the caller is a member of.
 */
export async function loadHistoryEvents(
  boardId: string,
  limit = 200,
): Promise<HistoryEvent[]> {
  const { data, error } = await supabase
    .from("history_events")
    .select("*")
    .eq("board_id", boardId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load history events: ${error.message}`);
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

/** Resolve display names for the actors appearing in a set of events. */
export async function loadActorProfiles(
  actorIds: string[],
): Promise<Map<string, { firstName: string; lastName: string }>> {
  const unique = Array.from(new Set(actorIds));
  if (unique.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, first_name, last_name")
    .in("user_id", unique);

  if (error || !data) {
    return new Map();
  }

  const map = new Map<string, { firstName: string; lastName: string }>();
  for (const row of data) {
    map.set(String(row.user_id), {
      firstName: String(row.first_name ?? ""),
      lastName: String(row.last_name ?? ""),
    });
  }
  return map;
}
