import { useCallback } from "react";

import "./NoteEditor.scss";

import type { FontSize, NoteEditorRef } from "./NoteEditor";

export interface NoteEditorToolbarProps {
  /** Reference to the NoteEditor */
  editorRef: React.RefObject<NoteEditorRef | null>;
  /** Current font size */
  fontSize: FontSize;
  /** Called when font size changes */
  onFontSizeChange: (size: FontSize) => void;
  /** Whether bold is currently active */
  isBold?: boolean;
  /** Called after bold toggle to refresh state */
  onBoldChange?: () => void;
  /** Disabled state */
  disabled?: boolean;
}

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: "S", label: "S" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
  { value: "XL", label: "XL" },
];

/**
 * NoteEditorToolbar - Toolbar for NoteEditor formatting controls
 *
 * Per PRD 7.5, 8.4:
 * - Bold toggle (only formatting option)
 * - Font size: S, M, L, XL
 */
export const NoteEditorToolbar: React.FC<NoteEditorToolbarProps> = ({
  editorRef,
  fontSize,
  onFontSizeChange,
  isBold = false,
  onBoldChange,
  disabled = false,
}) => {
  const handleBoldClick = useCallback(() => {
    editorRef.current?.toggleBold();
    editorRef.current?.focus();
    onBoldChange?.();
  }, [editorRef, onBoldChange]);

  const handleFontSizeClick = useCallback(
    (size: FontSize) => {
      onFontSizeChange(size);
      editorRef.current?.focus();
    },
    [editorRef, onFontSizeChange],
  );

  return (
    <div className="note-editor-toolbar">
      <button
        type="button"
        className={`note-editor-toolbar__button note-editor-toolbar__button--bold ${
          isBold ? "note-editor-toolbar__button--active" : ""
        }`}
        onClick={handleBoldClick}
        disabled={disabled}
        aria-label="Toggle bold"
        aria-pressed={isBold}
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </button>

      <div className="note-editor-toolbar__separator" />

      <div className="note-editor-toolbar__font-sizes">
        {FONT_SIZE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`note-editor-toolbar__button note-editor-toolbar__button--size ${
              fontSize === option.value
                ? "note-editor-toolbar__button--active"
                : ""
            }`}
            onClick={() => handleFontSizeClick(option.value)}
            disabled={disabled}
            aria-label={`Font size ${option.label}`}
            aria-pressed={fontSize === option.value}
            title={`Font size ${option.label}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};
