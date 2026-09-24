import { useCallback, useEffect, useRef, useState } from "react";

import { useAtomValue } from "../../app-jotai";
import {
  currentBoardIdAtom,
  isAuthenticatedAtom,
} from "../../auth/atoms";
import {
  createPersonalNote,
  deletePersonalNote,
  loadPersonalNotes,
  savePersonalNote,
} from "../../data/personalNotes";
import { formatNoteTimestamp } from "../../utils/formatters";
import { FloatingWindow } from "../FloatingWindow";
import { NoteEditor, NoteEditorToolbar } from "../NoteEditor";

import "./PersonalNotes.scss";

import type { PersonalNote } from "../../data/personalNotes";
import type { FontSize, NoteEditorRef } from "../NoteEditor";

export const PersonalNotes = () => {
  const boardId = useAtomValue(currentBoardIdAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const editorRef = useRef<NoteEditorRef>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [fontSize, setFontSize] = useState<FontSize>("M");
  const [isBold, setIsBold] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "loading" | "saving" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeNote =
    notes.find((note) => note.id === activeNoteId) ?? null;

  const refresh = useCallback(async () => {
    if (!boardId || !isAuthenticated) {
      setNotes([]);
      setActiveNoteId(null);
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    try {
      const loadedNotes = await loadPersonalNotes(boardId);
      setNotes(loadedNotes);
      setActiveNoteId((current) => {
        if (current && loadedNotes.some((note) => note.id === current)) {
          return current;
        }
        return loadedNotes[0]?.id ?? null;
      });
      setStatus("idle");
    } catch (error) {
      console.warn("Could not load Personal Notes:", error);
      setStatus("error");
      setErrorMessage("Could not load Personal Notes.");
    }
  }, [boardId, isAuthenticated]);

  useEffect(() => {
    if (isOpen) {
      void refresh();
    }
  }, [isOpen, refresh]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsOpen(false);
      setNotes([]);
      setActiveNoteId(null);
      setContent("");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!activeNote) {
      setContent("");
      return;
    }

    setContent(activeNote.content);
  }, [activeNote]);

  const handleCreate = useCallback(async () => {
    if (!boardId) {
      return;
    }

    setStatus("saving");
    setErrorMessage(null);

    try {
      const note = await createPersonalNote(boardId);
      setNotes((current) => [note, ...current]);
      setActiveNoteId(note.id);
      setContent("");
      setStatus("idle");
    } catch (error) {
      console.warn("Could not create Personal Note:", error);
      setStatus("error");
      setErrorMessage("Could not create Personal Note.");
    }
  }, [boardId]);

  const handleContentChange = useCallback(
    async (nextContent: string) => {
      setContent(nextContent);
      setErrorMessage(null);

      if (!activeNote) {
        return;
      }

      try {
        await savePersonalNote(activeNote.id, nextContent);

        const now = new Date().toISOString();
        setNotes((current) =>
          current.map((note) =>
            note.id === activeNote.id
              ? {
                  ...note,
                  content: nextContent,
                  contentEditedAt: now,
                  updatedAt: now,
                }
              : note,
          ),
        );
      } catch (error) {
        console.warn("Could not save Personal Note:", error);
        setErrorMessage("Could not save changes.");
      }
    },
    [activeNote],
  );

  const handleDelete = useCallback(async () => {
    if (!activeNote) {
      return;
    }

    setStatus("saving");
    setErrorMessage(null);

    try {
      await deletePersonalNote(activeNote.id);
      setActiveNoteId(null);
      await refresh();
      setStatus("idle");
    } catch (error) {
      console.warn("Could not delete Personal Note:", error);
      setStatus("error");
      setErrorMessage("Could not delete Personal Note.");
    }
  }, [activeNote, refresh]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="personal-notes-trigger"
        onClick={() => setIsOpen((open) => !open)}
        title="Personal Notes"
      >
        Personal Notes
      </button>

      {isOpen && (
        <FloatingWindow
          title="Personal Notes"
          onClose={() => {
            setIsOpen(false);
            setActiveNoteId(null);
          }}
          defaultSize={{ width: 520, height: 560 }}
          minSize={{ width: 380, height: 360 }}
        >
          <div
            className="personal-notes"
            onKeyDownCapture={(event) => event.stopPropagation()}
          >
            <div className="personal-notes__sidebar">
              <button
                type="button"
                className="personal-notes__new"
                onClick={handleCreate}
                disabled={!boardId || status === "saving"}
              >
                + New note
              </button>

              <div className="personal-notes__list">
                {status === "loading" && notes.length === 0 && (
                  <div className="personal-notes__empty">Loading...</div>
                )}

                {status !== "loading" && notes.length === 0 && (
                  <div className="personal-notes__empty">
                    No Personal Notes yet.
                  </div>
                )}

                {notes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className={`personal-notes__list-item ${
                      note.id === activeNoteId
                        ? "personal-notes__list-item--active"
                        : ""
                    }`}
                    onClick={() => setActiveNoteId(note.id)}
                  >
                    <strong>Personal note</strong>
                    <span>
                      {formatNoteTimestamp(new Date(note.updatedAt))}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="personal-notes__main">
              {!activeNote ? (
                <div className="personal-notes__empty">
                  Select a note or create a new one.
                </div>
              ) : (
                <>
                  <div className="personal-notes__meta">
                    <span>Private to you</span>
                    <span>
                      {formatNoteTimestamp(new Date(activeNote.updatedAt))}
                    </span>
                  </div>

                  <NoteEditorToolbar
                    editorRef={editorRef}
                    fontSize={fontSize}
                    onFontSizeChange={setFontSize}
                    isBold={isBold}
                    onBoldChange={() =>
                      setIsBold(editorRef.current?.isBold() ?? false)
                    }
                    disabled={status === "saving"}
                  />

                  <NoteEditor
                    ref={editorRef}
                    value={content}
                    onChange={handleContentChange}
                    placeholder="Write a Personal Note..."
                    fontSize={fontSize}
                  />

                  <div className="personal-notes__actions">
                    <button
                      type="button"
                      onClick={() => setActiveNoteId(null)}
                    >
                      Done
                    </button>

                    <button
                      type="button"
                      className="personal-notes__delete"
                      onClick={handleDelete}
                      disabled={status === "saving"}
                    >
                      Delete
                    </button>
                  </div>

                  {errorMessage && (
                    <div className="personal-notes__error">
                      {errorMessage}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </FloatingWindow>
      )}
    </>
  );
};
