/**
 * Shared formatting utilities for Construct Cycle Two
 *
 * Per PRD Sections 11.8-11.16:
 * - Display names: first name + last initial
 * - Dates: M/D/YYYY (notes) or M/D/YY (authorship)
 * - Times: h:mmam/pm
 * - Timezone: viewer-local browser timezone
 */

// =============================================================================
// Display Name Formatting
// =============================================================================

/**
 * Format display name as "FirstName L" (first name + last initial)
 * Per PRD 11.9
 *
 * @example
 * formatDisplayName("Rob", "Wilson") // "Rob W"
 * formatDisplayName("Alice", "") // "Alice"
 */
export function formatDisplayName(firstName: string, lastName: string): string {
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();

  if (!trimmedLast) {
    return trimmedFirst;
  }

  const lastInitial = trimmedLast.charAt(0).toUpperCase();
  return `${trimmedFirst} ${lastInitial}`;
}

/**
 * Format display name with collision handling
 * Per PRD 11.10: If "Rob W" collides, use "Rob Wi" vs "Rob Wa"
 *
 * @example
 * formatDisplayNameUnique("Rob", "Wilson", ["Rob W"]) // "Rob Wi"
 * formatDisplayNameUnique("Rob", "Walker", ["Rob W", "Rob Wi"]) // "Rob Wa"
 */
export function formatDisplayNameUnique(
  firstName: string,
  lastName: string,
  existingNames: string[],
): string {
  const base = formatDisplayName(firstName, lastName);

  if (!existingNames.includes(base)) {
    return base;
  }

  // Collision detected - add second character of last name
  const trimmedLast = lastName.trim();
  if (trimmedLast.length > 1) {
    const extended = `${firstName.trim()} ${trimmedLast.substring(0, 2)}`;
    return extended;
  }

  // Last name is single character, can't extend further
  return base;
}

// =============================================================================
// Date Formatting
// =============================================================================

/**
 * Format date as M/D/YYYY for notes (History, Personal Notes, Team Notes)
 * Per PRD 11.13
 *
 * @example
 * formatDateFull(new Date("2026-09-18")) // "9/18/2026"
 */
export function formatDateFull(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Format date as M/D/YY for authorship hover
 * Per PRD 11.14
 *
 * @example
 * formatDateShort(new Date("2026-09-18")) // "9/18/26"
 */
export function formatDateShort(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear().toString().slice(-2);
  return `${month}/${day}/${year}`;
}

// =============================================================================
// Time Formatting
// =============================================================================

/**
 * Format time as h:mmam/pm (no space before am/pm)
 * Per PRD 11.15
 *
 * @example
 * formatTime(new Date("2026-09-18T11:42:00")) // "11:42am"
 * formatTime(new Date("2026-09-18T14:05:00")) // "2:05pm"
 */
export function formatTime(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "pm" : "am";

  // Convert to 12-hour format
  hours = hours % 12;
  if (hours === 0) {
    hours = 12;
  }

  const minutesStr = minutes.toString().padStart(2, "0");
  return `${hours}:${minutesStr}${ampm}`;
}

// =============================================================================
// Combined Formatters
// =============================================================================

/**
 * Format authorship display: "Rob W 11:42am 9/18/26"
 * Per PRD 5.5
 *
 * @example
 * formatAuthorship("Rob", "Wilson", new Date("2026-09-18T11:42:00"))
 * // "Rob W 11:42am 9/18/26"
 */
export function formatAuthorship(
  firstName: string,
  lastName: string,
  createdAt: Date,
): string {
  const name = formatDisplayName(firstName, lastName);
  const time = formatTime(createdAt);
  const date = formatDateShort(createdAt);
  return `${name} ${time} ${date}`;
}

/**
 * Format note timestamp: "9/18/2026 11:42am"
 * For Personal Notes and Team Notes display
 *
 * @example
 * formatNoteTimestamp(new Date("2026-09-18T11:42:00"))
 * // "9/18/2026 11:42am"
 */
export function formatNoteTimestamp(date: Date): string {
  const dateStr = formatDateFull(date);
  const timeStr = formatTime(date);
  return `${dateStr} ${timeStr}`;
}

// =============================================================================
// History Grouping Helpers
// =============================================================================

/**
 * Get relative date label for history grouping
 * Per PRD 6.4: Today, Yesterday, This Week, Last Week, etc.
 *
 * @example
 * getRelativeDateLabel(new Date()) // "Today"
 * getRelativeDateLabel(yesterday) // "Yesterday"
 */
export function getRelativeDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  const diffTime = today.getTime() - targetDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return "This Week";
  }
  if (diffDays < 14) {
    return "Last Week";
  }
  if (diffDays < 30) {
    return "This Month";
  }
  if (diffDays < 60) {
    return "Last Month";
  }

  // For older dates, return month/year
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();

  if (year === now.getFullYear()) {
    return month;
  }

  return `${month} ${year}`;
}
