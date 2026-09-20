import {
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";

import "./NoteEditor.scss";

export type FontSize = "S" | "M" | "L" | "XL";

export const FONT_SIZES: Record<FontSize, number> = {
  S: 12,
  M: 14,
  L: 18,
  XL: 24,
} as const;

export interface NoteEditorProps {
  /** HTML content value */
  value: string;
  /** Called when content changes */
  onChange: (value: string) => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Read-only mode */
  readOnly?: boolean;
  /** Font size preset */
  fontSize?: FontSize;
  /** Additional class name */
  className?: string;
}

export interface NoteEditorRef {
  /** Focus the editor */
  focus: () => void;
  /** Toggle bold on selection */
  toggleBold: () => void;
  /** Check if selection is bold */
  isBold: () => boolean;
}

/**
 * Sanitize HTML content to only allow bold tags
 * Per PRD: Bold formatting only, no other rich-text features
 */
function sanitizeHtml(html: string): string {
  // Create a temporary element to parse HTML
  const temp = document.createElement("div");
  temp.innerHTML = html;

  // Walk the DOM and keep only text and <b>/<strong> tags
  const sanitize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();
      const childContent = Array.from(node.childNodes).map(sanitize).join("");

      // Keep bold tags
      if (tagName === "b" || tagName === "strong") {
        return `<b>${childContent}</b>`;
      }

      // For all other elements, just return their text content
      return childContent;
    }

    return "";
  };

  return Array.from(temp.childNodes).map(sanitize).join("");
}

/**
 * NoteEditor - A simple rich text editor for notes
 *
 * Per PRD 7.5, 8.4:
 * - Multiline text input
 * - Bold formatting only (Ctrl/Cmd+B)
 * - Text sizes: S (12px), M (14px), L (18px), XL (24px)
 */
export const NoteEditor = forwardRef<NoteEditorRef, NoteEditorProps>(
  (
    {
      value,
      onChange,
      placeholder = "Write a note...",
      autoFocus = false,
      readOnly = false,
      fontSize = "M",
      className = "",
    },
    ref,
  ) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const lastValueRef = useRef(value);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focus: () => {
        editorRef.current?.focus();
      },
      toggleBold: () => {
        document.execCommand("bold", false);
      },
      isBold: () => {
        return document.queryCommandState("bold");
      },
    }));

    // Sync external value changes to contenteditable
    useEffect(() => {
      if (editorRef.current && value !== lastValueRef.current) {
        // Only update if the value actually changed externally
        const currentHtml = editorRef.current.innerHTML;
        if (currentHtml !== value) {
          editorRef.current.innerHTML = value;
        }
        lastValueRef.current = value;
      }
    }, [value]);

    // Auto-focus on mount
    useEffect(() => {
      if (autoFocus && editorRef.current) {
        editorRef.current.focus();
      }
    }, [autoFocus]);

    // Handle input changes
    const handleInput = useCallback(() => {
      if (editorRef.current) {
        const html = editorRef.current.innerHTML;
        lastValueRef.current = html;
        onChange(html);
      }
    }, [onChange]);

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        // Ctrl/Cmd + B for bold
        if ((e.ctrlKey || e.metaKey) && e.key === "b") {
          e.preventDefault();
          document.execCommand("bold", false);
          handleInput();
        }
      },
      [handleInput],
    );

    // Handle paste - sanitize to remove unwanted formatting
    const handlePaste = useCallback(
      (e: React.ClipboardEvent) => {
        e.preventDefault();

        // Try to get HTML content first
        const html = e.clipboardData.getData("text/html");
        const text = e.clipboardData.getData("text/plain");

        let content: string;
        if (html) {
          // Sanitize HTML to only keep bold tags
          content = sanitizeHtml(html);
        } else {
          // Plain text - escape HTML entities
          content = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>");
        }

        // Insert at cursor position
        document.execCommand("insertHTML", false, content);
        handleInput();
      },
      [handleInput],
    );

    const fontSizePx = FONT_SIZES[fontSize];
    const isEmpty = !value || value === "<br>" || value === "";

    return (
      <div
        className={`note-editor ${className} ${
          isEmpty ? "note-editor--empty" : ""
        }`}
        data-placeholder={placeholder}
      >
        <div
          ref={editorRef}
          className="note-editor__content"
          contentEditable={!readOnly}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          style={{ fontSize: `${fontSizePx}px` }}
          role="textbox"
          aria-multiline="true"
          aria-placeholder={placeholder}
          suppressContentEditableWarning
        />
      </div>
    );
  },
);

NoteEditor.displayName = "NoteEditor";
