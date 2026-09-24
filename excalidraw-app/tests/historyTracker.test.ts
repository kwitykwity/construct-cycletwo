import { describe, expect, it } from "vitest";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import {
  classifyChange,
  classifyTouched,
  HistoryTracker,
  signatureOf,
} from "../data/historyTracker";

import type { TrackedHistoryEvent } from "../data/historyTracker";

const makeElement = (
  overrides: Partial<OrderedExcalidrawElement> = {},
): OrderedExcalidrawElement =>
  ({
    id: "el-1",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    strokeColor: "#000",
    backgroundColor: "transparent",
    fillStyle: "hachure",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    angle: 0,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: "a0",
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 1,
    created: 1,
    link: null,
    locked: false,
    ...overrides,
  } as OrderedExcalidrawElement);

type Entry = { element: OrderedExcalidrawElement; order: number };

const run = (baseline: Entry[], current: Entry[], touched: string[]) =>
  classifyTouched(
    new Map(baseline.map((b) => [b.element.id, b])),
    new Map(current.map((b) => [b.element.id, b])),
    touched,
  );

const typesOf = (events: TrackedHistoryEvent[], action: string) =>
  events.find((e) => e.action === action)?.elementTypes;

describe("signatureOf", () => {
  it("ignores identity, position and versioning", () => {
    const a = makeElement({ id: "a", x: 1, y: 2, seed: 3, version: 4 });
    const b = makeElement({ id: "b", x: 10, y: 20, seed: 30, version: 40 });
    expect(signatureOf(a)).toBe(signatureOf(b));
  });

  it("changes when content changes", () => {
    const a = makeElement({ strokeColor: "#000" });
    const b = makeElement({ strokeColor: "#111" });
    expect(signatureOf(a)).not.toBe(signatureOf(b));
  });
});

describe("classifyChange", () => {
  it("returns Deleted when after is null", () => {
    const before = makeElement();
    expect(classifyChange(before, null, true)).toBe("Deleted");
  });

  it("detects Locked / Unlocked", () => {
    const before = makeElement({ locked: false });
    const locked = { ...before, locked: true };
    const unlocked = { ...locked, locked: false };
    expect(classifyChange(before, locked, true)).toBe("Locked");
    expect(classifyChange(locked, unlocked, true)).toBe("Unlocked");
  });

  it("detects Grouped / Ungrouped", () => {
    const before = makeElement({ groupIds: [] as string[] });
    const grouped = { ...before, groupIds: ["g1"] };
    const ungrouped = { ...grouped, groupIds: [] as string[] };
    expect(classifyChange(before, grouped, true)).toBe("Grouped");
    expect(classifyChange(grouped, ungrouped, true)).toBe("Ungrouped");
  });

  it("detects Reorganized when containerId changes", () => {
    const before = makeElement({
      type: "text",
      containerId: null,
    } as unknown as Partial<OrderedExcalidrawElement>);
    const after = {
      ...before,
      containerId: "container-1",
    } as unknown as OrderedExcalidrawElement;
    expect(classifyChange(before, after, true)).toBe("Reorganized");
  });

  it("detects Resized", () => {
    const before = makeElement();
    const after = { ...before, width: 200 };
    expect(classifyChange(before, after, true)).toBe("Resized");
  });

  it("detects Moved", () => {
    const before = makeElement();
    const after = { ...before, x: 50 };
    expect(classifyChange(before, after, true)).toBe("Moved");
  });

  it("detects Edited from style change", () => {
    const before = makeElement();
    const after = { ...before, strokeColor: "#f00" };
    expect(classifyChange(before, after, true)).toBe("Edited");
  });

  it("detects Edited from text change", () => {
    const before = makeElement({
      type: "text",
      text: "a",
    } as unknown as Partial<OrderedExcalidrawElement>);
    const after = {
      ...before,
      text: "b",
    } as unknown as OrderedExcalidrawElement;
    expect(classifyChange(before, after, true)).toBe("Edited");
  });

  it("returns Reordered when only order changed", () => {
    const before = makeElement();
    const after = { ...before };
    expect(classifyChange(before, after, false)).toBe("Reordered");
    expect(classifyChange(before, after, true)).toBeNull();
  });
});

describe("classifyTouched", () => {
  it("classifies Created", () => {
    const el = makeElement({ id: "new" });
    const events = run([], [{ element: el, order: 0 }], ["new"]);
    expect(events.find((e) => e.action === "Created")).toBeDefined();
    expect(typesOf(events, "Created")).toEqual({ rectangle: 1 });
  });

  it("classifies Deleted", () => {
    const el = makeElement();
    const events = run([{ element: el, order: 0 }], [], ["el-1"]);
    expect(events.find((e) => e.action === "Deleted")).toBeDefined();
  });

  it("classifies Duplicated when a content-identical element exists", () => {
    const source = makeElement({ id: "src" });
    const copy = makeElement({ id: "copy", x: 10, y: 10 });
    const events = run(
      [{ element: source, order: 0 }],
      [
        { element: source, order: 0 },
        { element: copy, order: 1 },
      ],
      ["copy"],
    );
    expect(events.find((e) => e.action === "Duplicated")).toBeDefined();
    expect(events.find((e) => e.action === "Created")).toBeUndefined();
  });

  it("groups multiple touched elements by action", () => {
    const a = makeElement({ id: "a" });
    const b = makeElement({ id: "b" });
    const bMoved = { ...b, x: 10 };
    const events = run(
      [
        { element: a, order: 0 },
        { element: b, order: 1 },
      ],
      [
        { element: a, order: 0 },
        { element: bMoved, order: 1 },
      ],
      ["b"],
    );
    expect(typesOf(events, "Moved")).toEqual({ rectangle: 1 });
  });

  it("net no-op: created then deleted in same burst", () => {
    const flash = makeElement({ id: "flash" });
    const events = run([], [{ element: flash, order: 0 }], []);
    expect(events).toEqual([]);
  });
});

describe("HistoryTracker", () => {
  it("emits no events on the first snapshot", () => {
    const events: TrackedHistoryEvent[] = [];
    const tracker = new HistoryTracker((e) => events.push(...e), {
      debounceMs: 1000,
    });
    tracker.process([makeElement()]);
    tracker.flushNow();
    expect(events).toEqual([]);
  });

  it("coalesces a burst into a single flush", () => {
    const events: TrackedHistoryEvent[] = [];
    const tracker = new HistoryTracker((e) => events.push(...e), {
      debounceMs: 10000,
    });
    const el = makeElement();
    tracker.process([el]);

    let moved = { ...el, x: 10 };
    tracker.process([moved]);
    moved = { ...moved, x: 20 };
    tracker.process([moved]);
    moved = { ...moved, x: 30 };
    tracker.process([moved]);

    tracker.pointerUp();
    expect(events).toEqual([
      { action: "Moved", elementTypes: { rectangle: 1 } },
    ]);
  });

  it("flush after debounce", async () => {
    const events: TrackedHistoryEvent[] = [];
    const tracker = new HistoryTracker((e) => events.push(...e), {
      debounceMs: 10,
    });
    const el = makeElement();
    tracker.process([el]);
    tracker.process([{ ...el, x: 5 }]);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("Moved");
    tracker.destroy();
  });

  it("does not emit a bulk scene reset", () => {
    const events: TrackedHistoryEvent[] = [];
    const tracker = new HistoryTracker((e) => events.push(...e), {
      debounceMs: 1000,
    });
    tracker.process([makeElement({ id: "a" }), makeElement({ id: "b" })]);
    // Replace the whole scene (simulates clear / import).
    tracker.process([makeElement({ id: "c" })]);
    tracker.flushNow();
    expect(events).toEqual([]);
  });

  it("deletes are detected after a baseline", () => {
    const events: TrackedHistoryEvent[] = [];
    const tracker = new HistoryTracker((e) => events.push(...e), {
      debounceMs: 1000,
    });
    const el = makeElement();
    const keep = makeElement({ id: "keep" });
    tracker.process([el, keep]);
    tracker.process([keep]);
    tracker.flushNow();
    expect(events).toEqual([
      { action: "Deleted", elementTypes: { rectangle: 1 } },
    ]);
  });

  it("treats a full clear as a bulk reset (no events)", () => {
    const events: TrackedHistoryEvent[] = [];
    const tracker = new HistoryTracker((e) => events.push(...e), {
      debounceMs: 1000,
    });
    tracker.process([makeElement({ id: "a" }), makeElement({ id: "b" })]);
    tracker.process([]);
    tracker.flushNow();
    expect(events).toEqual([]);
  });
});
