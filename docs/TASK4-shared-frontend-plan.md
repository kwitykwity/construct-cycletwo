# Task 4 - Shared Frontend Component/Utility Plan

**PRD Sections:** 11.8-11.16, 16.5

**Purpose:** Define reusable patterns to avoid duplicate formatters/windows/editors across features.

---

## 1. Display Name Formatter

**PRD 11.9:** First name + last initial (e.g., "Rob W")

**Existing Pattern Found:**

- `packages/excalidraw/clients.ts` has `getNameInitial(name)` - returns first character uppercase
- Handles Unicode surrogate pairs correctly

**Recommendation:** Create new utility in `excalidraw-app/utils/formatters.ts`

```typescript
/**
 * Format display name as "FirstName L" (first name + last initial)
 * Per PRD 11.9
 */
export function formatDisplayName(firstName: string, lastName: string): string {
  const lastInitial = lastName ? lastName.charAt(0).toUpperCase() : "";
  return `${firstName} ${lastInitial}`.trim();
}

/**
 * Handle collision: "Rob W" vs "Rob W" → "Rob Wa" vs "Rob Wi"
 * Per PRD 11.10
 */
export function formatDisplayNameWithCollision(
  firstName: string,
  lastName: string,
  existingNames: string[],
): string {
  const base = formatDisplayName(firstName, lastName);
  if (!existingNames.includes(base)) {
    return base;
  }
  // Add second character of last name
  const extended =
    lastName.length > 1 ? `${firstName} ${lastName.substring(0, 2)}` : base;
  return extended;
}
```

**Location:** `excalidraw-app/utils/formatters.ts` (new file)

---

## 2. Date/Time Formatter

**PRD Requirements:**

- History/Personal/Team Notes: `M/D/YYYY` (e.g., "9/18/2026")
- Authorship hover: `M/D/YY` (e.g., "9/18/26")
- Time: `h:mmam/pm` (e.g., "11:42am")
- Timezone: viewer-local browser timezone

**Existing Pattern Found:**

- `packages/common/src/utils.ts` has `getDateTime()` - but uses `YYYY-MM-DD-HHMM` format
- `ChatMessage.tsx` uses `toLocaleTimeString()` with options

**Recommendation:** Create date/time utilities in `excalidraw-app/utils/formatters.ts`

```typescript
/**
 * Format date as M/D/YYYY for notes
 * Per PRD 11.13
 */
export function formatDateLong(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

/**
 * Format date as M/D/YY for authorship hover
 * Per PRD 11.14
 */
export function formatDateShort(date: Date): string {
  const year = date.getFullYear().toString().slice(-2);
  return `${date.getMonth() + 1}/${date.getDate()}/${year}`;
}

/**
 * Format time as h:mmam/pm
 * Per PRD 11.15
 */
export function formatTime(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `${hours}:${minutes}${ampm}`;
}

/**
 * Format authorship display: "Rob W 11:42am 9/18/26"
 * Per PRD 5.5
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
```

**Location:** `excalidraw-app/utils/formatters.ts`

---

## 3. Floating Window Pattern

**PRD Requirements:**

- Used for: History Panel, Personal Notes, Team Notes
- Movable within viewport
- Resizable (within limits)
- X button to close
- Default geometry per feature

**Existing Patterns Found:**

| Component | File | Features |
| --- | --- | --- |
| `Modal` | `packages/excalidraw/components/Modal.tsx` | Portal, ESC close, overlay |
| `Dialog` | `packages/excalidraw/components/Dialog.tsx` | Size presets, focus trap, close button |
| `Popover` | `packages/excalidraw/components/Popover.tsx` | Viewport-aware positioning |
| `Sidebar` | `packages/excalidraw/components/Sidebar/` | Docked/undocked, tabs |

**Problem:** None of these support drag-to-move or resize.

**Recommendation:** Create `FloatingWindow` component in `excalidraw-app/components/FloatingWindow/`

```typescript
interface FloatingWindowProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;

  // Position & size
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };

  // Behavior
  resizable?: boolean;
  draggable?: boolean;
}
```

**Implementation Approach:**

1. Use React Portal (like Modal.tsx)
2. Track position/size in local state
3. Drag via mousedown/mousemove on title bar
4. Resize via corner/edge handles
5. Constrain to viewport bounds
6. Store position in localStorage per window ID

**Files to Create:**

- `excalidraw-app/components/FloatingWindow/FloatingWindow.tsx`
- `excalidraw-app/components/FloatingWindow/FloatingWindow.scss`
- `excalidraw-app/components/FloatingWindow/index.ts`

**Default Geometries (per PRD):** | Window | Width | Height | Position | |--------|-------|--------|----------| | History Panel | 300px | 400px | Right side | | Personal Notes | 350px | 450px | Center-right | | Team Notes | 400px | 500px | Center |

---

## 4. Note Editor Component

**PRD Requirements (7.5, 8.4):**

- Multiline text input
- Bold formatting only (no italic, underline, etc.)
- Text sizes: S (12px), M (14px default), L (18px), XL (24px)
- No other rich-text features

**Existing Patterns Found:**

- `CodeMirrorEditor.tsx` - Full CodeMirror, too heavy for notes
- `ProjectName.tsx` - Simple single-line input
- Chat textarea - Basic multiline, no formatting

**Recommendation:** Create simple `NoteEditor` component

**Approach:** Use `contenteditable` div with minimal formatting

```typescript
interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
}

// Toolbar state
interface NoteEditorToolbarProps {
  onBoldToggle: () => void;
  isBold: boolean;
  fontSize: "S" | "M" | "L" | "XL";
  onFontSizeChange: (size: "S" | "M" | "L" | "XL") => void;
}
```

**Font Size Mapping:**

```typescript
const FONT_SIZES = {
  S: 12,
  M: 14, // default
  L: 18,
  XL: 24,
} as const;
```

**Implementation Notes:**

- Use `contenteditable` with `execCommand("bold")` for bold toggle
- Store content as HTML string (limited: only `<b>` tags allowed)
- Sanitize on paste to strip disallowed formatting
- Keyboard shortcut: Ctrl/Cmd+B for bold

**Files to Create:**

- `excalidraw-app/components/NoteEditor/NoteEditor.tsx`
- `excalidraw-app/components/NoteEditor/NoteEditorToolbar.tsx`
- `excalidraw-app/components/NoteEditor/NoteEditor.scss`
- `excalidraw-app/components/NoteEditor/index.ts`

---

## 5. Loading/Error/Retry UI Patterns

**Existing Patterns Found:**

| Pattern | Component | Usage |
| --- | --- | --- |
| Spinner | `Spinner.tsx` | SVG animated spinner, configurable size |
| Loading Message | `LoadingMessage.tsx` | Spinner + text with delay |
| Button Loading | `FilledButton.tsx` | `status="loading"` shows spinner |
| Error Dialog | `ErrorDialog.tsx` | Modal error display |
| Retry Button | `ChatMessage.tsx` | 5-second cooldown pattern |

**Recommendation:** Reuse existing components, create wrapper utilities

```typescript
// excalidraw-app/components/LoadingState.tsx
export const LoadingState: React.FC<{ message?: string }> = ({ message }) => (
  <div className="loading-state">
    <Spinner size="2em" />
    {message && <span>{message}</span>}
  </div>
);

// excalidraw-app/components/ErrorState.tsx
export const ErrorState: React.FC<{
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}> = ({ message, onRetry, retryLabel = "Try Again" }) => (
  <div className="error-state">
    <span className="error-state__message">{message}</span>
    {onRetry && (
      <button className="error-state__retry" onClick={onRetry}>
        {retryLabel}
      </button>
    )}
  </div>
);

// excalidraw-app/components/EmptyState.tsx
export const EmptyState: React.FC<{
  message: string;
  icon?: React.ReactNode;
}> = ({ message, icon }) => (
  <div className="empty-state">
    {icon}
    <span>{message}</span>
  </div>
);
```

**Files to Create:**

- `excalidraw-app/components/states/LoadingState.tsx`
- `excalidraw-app/components/states/ErrorState.tsx`
- `excalidraw-app/components/states/EmptyState.tsx`
- `excalidraw-app/components/states/states.scss`
- `excalidraw-app/components/states/index.ts`

---

## File Structure Summary

```
excalidraw-app/
├── utils/
│   └── formatters.ts          # Display name, date/time formatters
├── components/
│   ├── FloatingWindow/
│   │   ├── FloatingWindow.tsx
│   │   ├── FloatingWindow.scss
│   │   └── index.ts
│   ├── NoteEditor/
│   │   ├── NoteEditor.tsx
│   │   ├── NoteEditorToolbar.tsx
│   │   ├── NoteEditor.scss
│   │   └── index.ts
│   └── states/
│       ├── LoadingState.tsx
│       ├── ErrorState.tsx
│       ├── EmptyState.tsx
│       ├── states.scss
│       └── index.ts
```

---

## Verification Checklist

- [x] Proposed pieces fit existing Excalidraw structure (uses same patterns as existing components)
- [x] No unnecessary frontend restructuring (new files only, no modifications to core)
- [x] No extra rich-text features (bold only, 4 sizes only)
- [x] Reuses existing components where possible (Spinner, Portal hooks)

---

## Dependencies

**Unlocks:**

- Personal Notes UI (uses FloatingWindow, NoteEditor, formatters)
- Team Notes UI (uses FloatingWindow, NoteEditor, formatters)
- History Panel (uses FloatingWindow, formatters, LoadingState)
- Element Authorship hover (uses formatAuthorship)

**Blocked Until:**

- Supabase migrations run (for testing with real data)

---

## Implementation Order

1. **formatters.ts** - No dependencies, simple utilities
2. **states/** - Simple components, reuse Spinner
3. **FloatingWindow/** - More complex, standalone
4. **NoteEditor/** - Can be built in parallel with FloatingWindow
