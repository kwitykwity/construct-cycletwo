/**
 * HistoryTracker - classifies meaningful board activity from Excalidraw's
 * onChange stream into one of the actions allowed by history_events.action.
 *
 * Excalidraw fires onChange for every intermediate scene mutation (a drag
 * generates many ticks). This tracker:
 *
 * 1. Snapshot: the first scene observed is treated as a baseline (existing /
 *    imported state) and never emits events - we never fabricate history for
 *    activity that happened before History tracking existed.
 * 2. Burst coalescing: element changes accumulate until a quiet window
 *    elapses or pointerUp fires; one drag then flushes as ONE event.
 * 3. Classification: per element, compare the pre-burst baseline against the
 *    current element and pick the dominant action (Locked/Unlocked/Grouped/
 *    Reorganized/Resized/Moved/Edited/Reordered in priority order).
 * 4. Bulk guard: if the touched set is most of the scene (import, clear,
 *    load), treat it as a scene reset - reset the baseline, emit nothing.
 *
 * History is scoped to the resolved board; the caller re-instantiates (or
 * calls reset()) when the board or user changes.
 */

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

export const HISTORY_ACTIONS = [
  "Created",
  "Edited",
  "Moved",
  "Resized",
  "Deleted",
  "Duplicated",
  "Grouped",
  "Ungrouped",
  "Locked",
  "Unlocked",
  "Reordered",
  "Reorganized",
] as const;

export type HistoryAction = typeof HISTORY_ACTIONS[number];

/** One meaningful board action, ready to persist. */
export interface TrackedHistoryEvent {
  action: HistoryAction;
  /** element type -> count, e.g. { rectangle: 2 }. */
  elementTypes: Record<string, number>;
}

export interface HistoryTrackerOptions {
  /** Quiet window in ms before an idle burst is flushed (default 800). */
  debounceMs?: number;
  /**
   * Fraction of the scene that, when touched in one burst, is treated as a
   * bulk scene reset instead of a set of individual actions (default 0.6).
   */
  bulkResetRatio?: number;
}

interface BaselineEntry {
  element: OrderedExcalidrawElement;
  order: number;
}

const STYLE_KEYS: (keyof OrderedExcalidrawElement)[] = [
  "strokeColor",
  "backgroundColor",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "opacity",
  "fillStyle",
  "fontSize",
  "fontFamily",
  "textAlign",
  "verticalAlign",
  "startBinding",
  "endBinding",
  "link",
] as (keyof OrderedExcalidrawElement)[];

/**
 * Content signature for duplicate detection. Position (x/y) is excluded so a
 * duplicated/pasted copy - which offsets slightly - still matches its source.
 */
function signatureOf(el: OrderedExcalidrawElement): string {
  const sig: Record<string, unknown> = {};
  for (const key of Object.keys(el)) {
    if (
      key === "id" ||
      key === "seed" ||
      key === "version" ||
      key === "versionNonce" ||
      key === "isDeleted" ||
      key === "index" ||
      key === "x" ||
      key === "y"
    ) {
      continue;
    }
    sig[key] = (el as unknown as Record<string, unknown>)[key];
  }
  return JSON.stringify(sig);
}

/**
 * Classify how a single element changed between `before` (pre-burst baseline)
 * and `after` (current). `after === null` means the element was deleted.
 * Returns null when nothing observable changed (e.g. reorder handled by caller).
 */
export function classifyChange(
  before: OrderedExcalidrawElement,
  after: OrderedExcalidrawElement | null,
  sameOrder: boolean,
): HistoryAction | null {
  if (after === null) {
    return "Deleted";
  }

  if (before.locked !== after.locked) {
    return after.locked ? "Locked" : "Unlocked";
  }

  const beforeGroups = (before.groupIds ?? []).length;
  const afterGroups = (after.groupIds ?? []).length;
  if (beforeGroups !== afterGroups) {
    return afterGroups > beforeGroups ? "Grouped" : "Ungrouped";
  }

  const beforeContainer =
    (before as { containerId?: string | null }).containerId ?? null;
  const afterContainer =
    (after as { containerId?: string | null }).containerId ?? null;
  if (beforeContainer !== afterContainer) {
    return "Reorganized";
  }

  const resized =
    before.width !== after.width ||
    before.height !== after.height ||
    before.angle !== after.angle;

  const moved = before.x !== after.x || before.y !== after.y;

  let styleChanged = false;
  for (const key of STYLE_KEYS) {
    if (before[key] !== after[key]) {
      styleChanged = true;
      break;
    }
  }
  const textChanged =
    (before.type === "text" ||
      before.type === "line" ||
      before.type === "arrow") &&
    (before as { text?: string }).text !== (after as { text?: string }).text;

  if (resized) {
    return "Resized";
  }
  if (moved) {
    return "Moved";
  }
  if (styleChanged || textChanged) {
    return "Edited";
  }
  if (!sameOrder) {
    return "Reordered";
  }
  return null;
}

/**
 * Group the touched elements into history events, keyed by action, using the
 * per-element classification above. Pure function - directly unit-tested.
 */
export function classifyTouched(
  baseline: Map<string, BaselineEntry>,
  current: Map<string, { element: OrderedExcalidrawElement; order: number }>,
  touchedIds: Iterable<string>,
): TrackedHistoryEvent[] {
  const grouped: TrackedHistoryEvent[] = [];

  const byAction = new Map<HistoryAction, Record<string, number>>();

  for (const id of touchedIds) {
    const before = baseline.get(id);
    const after = current.get(id) ?? null;

    let action: HistoryAction | null = null;
    if (!before && after) {
      // New element. Duplicated when an identical survivor already exists.
      let duplicated = false;
      const afterSig = signatureOf(after.element);
      for (const b of baseline.values()) {
        const el = b.element;
        if (!el.isDeleted && signatureOf(el) === afterSig) {
          duplicated = true;
          break;
        }
      }
      action = duplicated ? "Duplicated" : "Created";
    } else if (before && after) {
      // A change in array index only reflects reindexing around a
      // concurrent add/delete; a reorder is only meaningful when the scene
      // size is stable.
      const sceneSizeStable = baseline.size === current.size;
      const sameOrder = sceneSizeStable ? before.order === after.order : true;
      action = classifyChange(before.element, after.element, sameOrder);
    } else if (before && !after) {
      action = "Deleted";
    }

    if (!action) {
      continue;
    }

    const elementType = after?.element.type ?? before?.element.type;
    if (!elementType) {
      continue;
    }
    const types = byAction.get(action) ?? {};
    types[elementType] = (types[elementType] ?? 0) + 1;
    byAction.set(action, types);
  }

  for (const action of HISTORY_ACTIONS) {
    const types = byAction.get(action);
    if (types) {
      grouped.push({ action, elementTypes: types });
    }
  }
  return grouped;
}

export class HistoryTracker {
  private baseline = new Map<string, BaselineEntry>();
  private current = new Map<
    string,
    { element: OrderedExcalidrawElement; order: number }
  >();
  private initiated = false;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly debounceMs: number;
  readonly bulkResetRatio: number;

  constructor(
    private readonly onFlush: (events: TrackedHistoryEvent[]) => void,
    options: HistoryTrackerOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 800;
    this.bulkResetRatio = options.bulkResetRatio ?? 0.6;
  }

  /**
   * Feed the current scene from Excalidraw's onChange. Returns events when a
   * bulk reset was detected (so the caller can ignore them) - otherwise null
   * and the flush happens asynchronously via debounce/pointerUp.
   */
  process(elements: readonly OrderedExcalidrawElement[]): { reset: boolean } {
    this.current.clear();
    elements.forEach((el, index) => {
      this.current.set(el.id, { element: el, order: index });
    });

    // First observed scene = baseline. Never emit history for it.
    if (!this.initiated) {
      this.initiated = true;
      this.commitBaseline();
      return { reset: true };
    }

    const touched = this.computeTouched();
    if (touched.size === 0) {
      return { reset: false };
    }

    // Bulk reset detection: the scene was cleared/replaced (import, clear, full
    // load), so no per-element events make sense. Signal is scene overlap, not
    // touched count - a drag in a tiny scene touches everything yet is real work.
    if (this.isBulkReset()) {
      this.commitBaseline();
      this.dirty = false;
      return { reset: true };
    }

    this.dirty = true;
    this.scheduleFlush();
    return { reset: false };
  }

  /** Flush immediately - wired to Excalidraw's onPointerUp. */
  pointerUp(): void {
    if (!this.dirty) {
      return;
    }
    this.flush();
  }

  /**
   * A bulk scene reset: most of the baseline scene was removed (clear, full
   * load, wholesale import), so per-element events would be noise and are
   * dropped in favour of re-baselining. Edits that remove a minority of the
   * scene (including deleting one of a few elements) still emit events.
   */
  private isBulkReset(): boolean {
    if (this.baseline.size === 0) {
      return false;
    }
    let removed = 0;
    for (const id of this.baseline.keys()) {
      if (!this.current.has(id)) {
        removed++;
      }
    }
    return removed / this.baseline.size >= this.bulkResetRatio;
  }

  /** Force a flush (used by tests and browser unload). */
  flushNow(): void {
    this.flush();
  }

  /** Clear all state - call when the board or signed-in user changes. */
  reset(): void {
    this.clearTimer();
    this.baseline.clear();
    this.current.clear();
    this.initiated = false;
    this.dirty = false;
  }

  destroy(): void {
    this.clearTimer();
  }

  private computeTouched(): Set<string> {
    const touched = new Set<string>();
    for (const id of this.baseline.keys()) {
      if (!this.current.has(id)) {
        touched.add(id);
      }
    }
    for (const [id, entry] of this.current) {
      const before = this.baseline.get(id);
      if (!before) {
        touched.add(id);
        continue;
      }
      if (before.element !== entry.element || before.order !== entry.order) {
        touched.add(id);
      }
    }
    return touched;
  }

  private flush(): void {
    this.clearTimer();
    if (!this.dirty) {
      return;
    }

    const touched = this.computeTouched();
    const events = classifyTouched(this.baseline, this.current, touched);

    this.dirty = false;
    this.commitBaseline();

    if (events.length > 0) {
      this.onFlush(events);
    }
  }

  private commitBaseline(): void {
    this.baseline.clear();
    for (const [id, entry] of this.current) {
      this.baseline.set(id, {
        element: entry.element,
        order: entry.order,
      });
    }
  }

  private scheduleFlush(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.debounceMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export { signatureOf };
