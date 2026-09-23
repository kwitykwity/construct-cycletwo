import { useCallback, useRef, useState } from "react";

import { useAtomValue } from "../../app-jotai";
import {
  currentBoardIdAtom,
  displayNameAtom,
  isAuthenticatedAtom,
} from "../../auth/atoms";
import { formatAuthorship, formatNoteTimestamp } from "../../utils/formatters";
import { FloatingWindow } from "../FloatingWindow";
import { NoteEditor, NoteEditorToolbar } from "../NoteEditor";
import { EmptyState, ErrorState, LoadingState } from "../states";

import "./Task8VerificationPanel.scss";

import type { FontSize, NoteEditorRef } from "../NoteEditor";

type PanelView = "editor" | "loading" | "error" | "empty";

/**
 * TEMPORARY - Task 8 verification harness. Not a product feature.
 *
 * Mounts the Task 4 shared infrastructure (FloatingWindow, NoteEditor +
 * toolbar, loading/error/empty states, formatters) inside the running app so
 * the authenticated-board checks can be performed before the real History /
 * Personal Notes / Team Notes UIs exist. Delete once those features land.
 *
 * Note: the wrapper below stops keydown events from reaching Excalidraw's
 * global shortcut handler. Without it, Backspace/Delete typed in the note
 * deletes the selected canvas element (see docs/TASK8-frontend-verification.md,
 * finding 2). The real fix belongs in NoteEditor and is owned by Task 4.
 */
export const Task8VerificationPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<PanelView>("editor");
  const [note, setNote] = useState("");
  const [fontSize, setFontSize] = useState<FontSize>("M");
  const [isBold, setIsBold] = useState(false);

  const editorRef = useRef<NoteEditorRef>(null);

  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const displayName = useAtomValue(displayNameAtom);
  const boardId = useAtomValue(currentBoardIdAtom);

  const refreshBold = useCallback(() => {
    setIsBold(editorRef.current?.isBold() ?? false);
  }, []);

  const now = new Date();

  return (
    <>
      <button
        type="button"
        className="task8-trigger"
        onClick={() => setIsOpen((open) => !open)}
        title="Task 8 verification harness (temporary)"
      >
        Task 8
      </button>

      {isOpen && (
        <FloatingWindow
          title="Task 8 - shared infrastructure check"
          windowId="task8"
          onClose={() => setIsOpen(false)}
          defaultSize={{ width: 380, height: 430 }}
        >
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            className="task8-panel"
            onKeyDownCapture={(event) => event.stopPropagation()}
          >
            <dl className="task8-panel__context">
              <dt>Authenticated</dt>
              <dd>{isAuthenticated ? "yes" : "no"}</dd>
              <dt>Display name</dt>
              <dd>{displayName ?? "(none)"}</dd>
              <dt>Board id</dt>
              <dd>{boardId ?? "(not resolved)"}</dd>
              <dt>Note timestamp</dt>
              <dd>{formatNoteTimestamp(now)}</dd>
              <dt>Authorship</dt>
              <dd>{formatAuthorship("Rob", "Walker", now)}</dd>
            </dl>

            <div className="task8-panel__views">
              {(["editor", "loading", "error", "empty"] as PanelView[]).map(
                (option) => (
                  <button
                    key={option}
                    type="button"
                    className={
                      view === option ? "task8-panel__view--active" : undefined
                    }
                    onClick={() => setView(option)}
                  >
                    {option}
                  </button>
                ),
              )}
            </div>

            {view === "editor" && (
              <>
                <NoteEditorToolbar
                  editorRef={editorRef}
                  fontSize={fontSize}
                  onFontSizeChange={setFontSize}
                  isBold={isBold}
                  onBoldChange={refreshBold}
                />
                <NoteEditor
                  ref={editorRef}
                  value={note}
                  onChange={setNote}
                  fontSize={fontSize}
                  placeholder="Type here to check the shared editor..."
                />
              </>
            )}
            {view === "loading" && <LoadingState message="Loading notes..." />}
            {view === "error" && (
              <ErrorState
                message="Could not load notes."
                onRetry={() => setView("editor")}
                retryCooldown={1000}
              />
            )}
            {view === "empty" && <EmptyState message="No notes yet." />}
          </div>
        </FloatingWindow>
      )}
    </>
  );
};
