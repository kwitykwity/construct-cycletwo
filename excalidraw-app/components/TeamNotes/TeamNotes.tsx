import { useCallback, useEffect, useRef, useState } from "react";

import { useAtomValue } from "../../app-jotai";
import {
  currentBoardIdAtom,
  isAuthenticatedAtom,
  supabaseUserAtom,
} from "../../auth/atoms";
import {
  createTeamNoteDraft,
  deleteTeamNote,
  loadTeamNoteBoardMembers,
  loadTeamNotes,
  loadTeamNoteViewerIds,
  publishTeamNote,
  saveTeamNoteDraft,
  updatePublishedTeamNoteContent,
  updateTeamNoteVisibility,
} from "../../data/teamNotes";
import { formatDisplayName, formatNoteTimestamp } from "../../utils/formatters";
import { FloatingWindow } from "../FloatingWindow";
import {
  NoteEditor,
  NoteEditorToolbar,
} from "../NoteEditor";

import "./TeamNotes.scss";

import type {
  TeamNote,
  TeamNoteBoardMember,
  TeamNoteVisibility,
} from "../../data/teamNotes";
import type { FontSize, NoteEditorRef } from "../NoteEditor";

const hasVisibleContent = (html: string): boolean => {
  const container = document.createElement("div");
  container.innerHTML = html;
  return (container.textContent ?? "").trim().length > 0;
};

export const TeamNotes = () => {
  const boardId = useAtomValue(currentBoardIdAtom);
  const user = useAtomValue(supabaseUserAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);

  const editorRef = useRef<NoteEditorRef>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [members, setMembers] = useState<TeamNoteBoardMember[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [visibility, setVisibility] =
    useState<TeamNoteVisibility>("everyone");
  const [selectedViewerIds, setSelectedViewerIds] = useState<string[]>([]);
  const [fontSize, setFontSize] = useState<FontSize>("M");
  const [isBold, setIsBold] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "loading" | "saving" | "publishing" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeNote =
    notes.find((note) => note.id === activeNoteId) ?? null;
  const isAuthor = Boolean(activeNote && user?.id === activeNote.authorId);
  const isPublished = Boolean(activeNote?.publishedAt);
  const canEdit = Boolean(activeNote && isAuthor);
  const canPublish =
    Boolean(activeNote) &&
    isAuthor &&
    !isPublished &&
    hasVisibleContent(content) &&
    (visibility === "everyone" || selectedViewerIds.length > 0);

  const refresh = useCallback(async () => {
    if (!boardId || !isAuthenticated) {
      setNotes([]);
      setMembers([]);
      setActiveNoteId(null);
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    try {
      const [loadedNotes, loadedMembers] = await Promise.all([
        loadTeamNotes(boardId),
        loadTeamNoteBoardMembers(boardId),
      ]);

      setNotes(loadedNotes);
      setMembers(loadedMembers);

      setActiveNoteId((current) => {
        if (current && loadedNotes.some((note) => note.id === current)) {
          return current;
        }
        return loadedNotes[0]?.id ?? null;
      });

      setStatus("idle");
    } catch (error) {
      console.warn("Could not load Team Notes:", error);
      setStatus("error");
      setErrorMessage("Could not load Team Notes.");
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
      setMembers([]);
      setActiveNoteId(null);
      setContent("");
      setSelectedViewerIds([]);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!activeNote) {
      setContent("");
      setVisibility("everyone");
      setSelectedViewerIds([]);
      return;
    }

    setContent(activeNote.content);
    setVisibility(activeNote.visibility ?? "everyone");
    setSelectedViewerIds([]);

    if (
      activeNote.publishedAt &&
      activeNote.visibility === "selected" &&
      activeNote.authorId === user?.id
    ) {
      void loadTeamNoteViewerIds(activeNote.id)
        .then(setSelectedViewerIds)
        .catch((error) => {
          console.warn("Could not load Team Note viewers:", error);
          setErrorMessage("Could not load selected viewers.");
        });
    }
  }, [activeNote, user?.id]);

  const handleCreate = useCallback(async () => {
    if (!boardId) {
      return;
    }

    setStatus("saving");
    setErrorMessage(null);

    try {
      const note = await createTeamNoteDraft(boardId);
      setNotes((current) => [note, ...current]);
      setActiveNoteId(note.id);
      setContent("");
      setVisibility("everyone");
      setSelectedViewerIds([]);
      setStatus("idle");
    } catch (error) {
      console.warn("Could not create Team Note:", error);
      setStatus("error");
      setErrorMessage("Could not create Team Note.");
    }
  }, [boardId]);

  const handleContentChange = useCallback(
    async (nextContent: string) => {
      setContent(nextContent);
      setErrorMessage(null);

      if (!activeNote || !isAuthor) {
        return;
      }

      try {
        if (activeNote.publishedAt) {
          await updatePublishedTeamNoteContent(activeNote.id, nextContent);
        } else {
          await saveTeamNoteDraft(activeNote.id, nextContent);
        }

        setNotes((current) =>
          current.map((note) =>
            note.id === activeNote.id
              ? { ...note, content: nextContent }
              : note,
          ),
        );
      } catch (error) {
        console.warn("Could not save Team Note:", error);
        setErrorMessage("Could not save changes.");
      }
    },
    [activeNote, isAuthor],
  );

  const handlePublish = useCallback(async () => {
    if (!activeNote || !canPublish) {
      return;
    }

    setStatus("publishing");
    setErrorMessage(null);

    try {
      await publishTeamNote(
        activeNote.id,
        content,
        visibility,
        selectedViewerIds,
      );
      await refresh();
      setActiveNoteId(activeNote.id);
      setStatus("idle");
    } catch (error) {
      console.warn("Could not publish Team Note:", error);
      setStatus("error");
      setErrorMessage("Could not publish Team Note.");
    }
  }, [
    activeNote,
    canPublish,
    content,
    visibility,
    selectedViewerIds,
    refresh,
  ]);

  const handleVisibilityChange = useCallback(
    async (nextVisibility: TeamNoteVisibility) => {
      setVisibility(nextVisibility);
      setErrorMessage(null);

      if (!activeNote?.publishedAt || !isAuthor) {
        return;
      }

      if (nextVisibility === "selected" && selectedViewerIds.length === 0) {
        return;
      }

      try {
        await updateTeamNoteVisibility(
          activeNote.id,
          nextVisibility,
          selectedViewerIds,
        );
        await refresh();
        setActiveNoteId(activeNote.id);
      } catch (error) {
        console.warn("Could not update Team Note visibility:", error);
        setErrorMessage("Could not update visibility.");
      }
    },
    [activeNote, isAuthor, selectedViewerIds, refresh],
  );

  const handleViewerToggle = useCallback((userId: string) => {
    setSelectedViewerIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }, []);

  const handleDelete = useCallback(async () => {
    if (!activeNote || !isAuthor) {
      return;
    }

    setStatus("saving");
    setErrorMessage(null);

    try {
      await deleteTeamNote(activeNote.id);
      setActiveNoteId(null);
      await refresh();
      setStatus("idle");
    } catch (error) {
      console.warn("Could not delete Team Note:", error);
      setStatus("error");
      setErrorMessage("Could not delete Team Note.");
    }
  }, [activeNote, isAuthor, refresh]);

  const otherMembers = members.filter((member) => member.userId !== user?.id);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="team-notes-trigger"
        onClick={() => setIsOpen((open) => !open)}
        title="Team Notes"
      >
        Team Notes
      </button>

      {isOpen && (
        <FloatingWindow
          title="Team Notes"
          onClose={() => { setIsOpen(false); setActiveNoteId(null); }}
          defaultSize={{ width: 520, height: 560 }}
          minSize={{ width: 380, height: 360 }}
        >
          <div
            className="team-notes"
            onKeyDownCapture={(event) => event.stopPropagation()}
          >
            <div className="team-notes__sidebar">
              <button
                type="button"
                className="team-notes__new"
                onClick={handleCreate}
                disabled={!boardId || status === "saving"}
              >
                + New note
              </button>

              <div className="team-notes__list">
                {status === "loading" && notes.length === 0 && (
                  <div className="team-notes__empty">Loading...</div>
                )}

                {status !== "loading" && notes.length === 0 && (
                  <div className="team-notes__empty">No Team Notes yet.</div>
                )}

                {notes.map((note) => {
                  const author = members.find(
                    (member) => member.userId === note.authorId,
                  );
                  const authorName = author
                    ? formatDisplayName(author.firstName, author.lastName)
                    : "Team member";

                  return (
                    <button
                      key={note.id}
                      type="button"
                      className={`team-notes__list-item ${
                        note.id === activeNoteId
                          ? "team-notes__list-item--active"
                          : ""
                      }`}
                      onClick={() => setActiveNoteId(note.id)}
                    >
                      <strong>
                        {note.publishedAt ? authorName : "Draft"}
                      </strong>
                      <span>
                        {formatNoteTimestamp(new Date(note.updatedAt))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="team-notes__main">
              {!activeNote ? (
                <div className="team-notes__empty">
                  Select a note or create a new one.
                </div>
              ) : (
                <>
                  <div className="team-notes__meta">
                    <span>
                      {isPublished ? "Published" : "Draft"}
                    </span>
                    <span>
                      {formatNoteTimestamp(new Date(activeNote.updatedAt))}
                    </span>
                  </div>

                  {canEdit && (
                    <NoteEditorToolbar
                      editorRef={editorRef}
                      fontSize={fontSize}
                      onFontSizeChange={setFontSize}
                      isBold={isBold}
                      onBoldChange={() =>
                        setIsBold(editorRef.current?.isBold() ?? false)
                      }
                      disabled={status === "publishing"}
                    />
                  )}

                  <NoteEditor
                    ref={editorRef}
                    value={content}
                    onChange={handleContentChange}
                    placeholder="Write a Team Note..."
                    readOnly={!canEdit}
                    fontSize={fontSize}
                  />

                  {isAuthor && (
                    <div className="team-notes__visibility">
                      <strong>Visible to</strong>

                      <label>
                        <input
                          type="radio"
                          name={`team-note-visibility-${activeNote.id}`}
                          checked={visibility === "everyone"}
                          onChange={() => {
                            void handleVisibilityChange("everyone");
                          }}
                        />
                        Everyone
                      </label>

                      <label>
                        <input
                          type="radio"
                          name={`team-note-visibility-${activeNote.id}`}
                          checked={visibility === "selected"}
                          onChange={() => {
                            setVisibility("selected");
                          }}
                        />
                        Selected
                      </label>

                      {visibility === "selected" && (
                        <div className="team-notes__viewers">
                          {otherMembers.length === 0 ? (
                            <span>No other board members available.</span>
                          ) : (
                            otherMembers.map((member) => (
                              <label key={member.userId}>
                                <input
                                  type="checkbox"
                                  checked={selectedViewerIds.includes(
                                    member.userId,
                                  )}
                                  onChange={() =>
                                    handleViewerToggle(member.userId)
                                  }
                                />
                                {formatDisplayName(
                                  member.firstName,
                                  member.lastName,
                                )}
                              </label>
                            ))
                          )}

                          {isPublished &&
                            selectedViewerIds.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleVisibilityChange("selected");
                                }}
                              >
                                Apply selected viewers
                              </button>
                            )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="team-notes__actions">
                    {isAuthor && !isPublished && (
                      <button
                        type="button"
                        onClick={handlePublish}
                        disabled={!canPublish || status === "publishing"}
                      >
                        {status === "publishing"
                          ? "Publishing..."
                          : "Publish"}
                      </button>
                    )}

                    {isAuthor && (
                      <button
                        type="button"
                        className="team-notes__delete"
                        onClick={handleDelete}
                        disabled={status === "saving"}
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  {errorMessage && (
                    <div className="team-notes__error">{errorMessage}</div>
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
