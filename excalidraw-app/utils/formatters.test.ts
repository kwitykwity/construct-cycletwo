import { describe, it, expect } from "vitest";

import {
  formatDisplayName,
  formatDisplayNameUnique,
  formatDateFull,
  formatDateShort,
  formatTime,
  formatAuthorship,
  formatNoteTimestamp,
  getRelativeDateLabel,
} from "./formatters";

describe("formatters", () => {
  describe("formatDisplayName", () => {
    it("formats first name + last initial", () => {
      expect(formatDisplayName("Rob", "Wilson")).toBe("Rob W");
      expect(formatDisplayName("Alice", "Smith")).toBe("Alice S");
    });

    it("handles empty last name", () => {
      expect(formatDisplayName("Rob", "")).toBe("Rob");
      expect(formatDisplayName("Alice", "  ")).toBe("Alice");
    });

    it("trims whitespace", () => {
      expect(formatDisplayName("  Rob  ", "  Wilson  ")).toBe("Rob W");
    });

    it("uppercases last initial", () => {
      expect(formatDisplayName("Rob", "wilson")).toBe("Rob W");
    });
  });

  describe("formatDisplayNameUnique", () => {
    it("returns base name when no collision", () => {
      expect(formatDisplayNameUnique("Rob", "Wilson", [])).toBe("Rob W");
      expect(formatDisplayNameUnique("Rob", "Wilson", ["Alice S"])).toBe(
        "Rob W",
      );
    });

    it("extends to two characters on collision", () => {
      expect(formatDisplayNameUnique("Rob", "Wilson", ["Rob W"])).toBe(
        "Rob Wi",
      );
      expect(formatDisplayNameUnique("Rob", "Walker", ["Rob W"])).toBe(
        "Rob Wa",
      );
    });

    it("returns base name for single-char last name", () => {
      expect(formatDisplayNameUnique("Rob", "W", ["Rob W"])).toBe("Rob W");
    });
  });

  describe("formatDateFull", () => {
    it("formats as M/D/YYYY", () => {
      expect(formatDateFull(new Date(2026, 8, 18))).toBe("9/18/2026");
      expect(formatDateFull(new Date(2026, 0, 5))).toBe("1/5/2026");
      expect(formatDateFull(new Date(2026, 11, 25))).toBe("12/25/2026");
    });
  });

  describe("formatDateShort", () => {
    it("formats as M/D/YY", () => {
      expect(formatDateShort(new Date(2026, 8, 18))).toBe("9/18/26");
      expect(formatDateShort(new Date(2026, 0, 5))).toBe("1/5/26");
    });
  });

  describe("formatTime", () => {
    it("formats as h:mmam/pm", () => {
      expect(formatTime(new Date(2026, 8, 18, 11, 42))).toBe("11:42am");
      expect(formatTime(new Date(2026, 8, 18, 14, 5))).toBe("2:05pm");
    });

    it("handles noon and midnight", () => {
      expect(formatTime(new Date(2026, 8, 18, 0, 0))).toBe("12:00am");
      expect(formatTime(new Date(2026, 8, 18, 12, 0))).toBe("12:00pm");
    });

    it("pads minutes with leading zero", () => {
      expect(formatTime(new Date(2026, 8, 18, 9, 5))).toBe("9:05am");
    });
  });

  describe("formatAuthorship", () => {
    it("combines name, time, and short date", () => {
      const date = new Date(2026, 8, 18, 11, 42);
      expect(formatAuthorship("Rob", "Wilson", date)).toBe(
        "Rob W 11:42am 9/18/26",
      );
    });
  });

  describe("formatNoteTimestamp", () => {
    it("combines full date and time", () => {
      const date = new Date(2026, 8, 18, 11, 42);
      expect(formatNoteTimestamp(date)).toBe("9/18/2026 11:42am");
    });
  });

  describe("getRelativeDateLabel", () => {
    it("returns Today for current date", () => {
      expect(getRelativeDateLabel(new Date())).toBe("Today");
    });

    it("returns Yesterday for previous day", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(getRelativeDateLabel(yesterday)).toBe("Yesterday");
    });

    it("returns This Week for 2-6 days ago", () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      expect(getRelativeDateLabel(threeDaysAgo)).toBe("This Week");
    });

    it("returns Last Week for 7-13 days ago", () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      expect(getRelativeDateLabel(tenDaysAgo)).toBe("Last Week");
    });
  });
});
