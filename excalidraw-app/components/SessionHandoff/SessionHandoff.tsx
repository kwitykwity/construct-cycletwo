import { useCallback, useEffect, useRef, useState } from "react";

import { useAtomValue } from "../../app-jotai";
import { currentBoardIdAtom, displayNameAtom } from "../../auth/atoms";
import { getExcalidrawRoomId } from "../../data/boardContext";
import {
  loadSessionHandoff,
  saveSessionHandoff,
} from "../../data/sessionHandoff";
import { formatNoteTimestamp } from "../../utils/formatters";
import { FloatingWindow } from "../FloatingWindow";

import "./SessionHandoff.scss";

import type { SessionHandoff as Handoff } from "../../data/sessionHandoff";

const EMPTY = { leftOff: "", whatsNext: "", ownerName: "" };

/**
 * Session Handoff - the client-approved MVP.
 *
 * Four fields only: where we left off, what's next, owner, timestamp. Someone
 * writes it as a session wraps up; whoever opens the board next sees it and
 * knows where to resume.
 */
export const SessionHandoff = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [saved, setSaved] = useState<Handoff | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  const boardId = useAtomValue(currentBoardIdAtom);
  const displayName = useAtomValue(displayNameAtom);
  const autoOpenedFor = useRef<string | null>(null);

  const roomId = getExcalidrawRoomId(window.location.href);

  // Load the board's handoff, and show it automatically the first time a board
  // with an existing handoff is opened - that is the "returning collaborator"
  // moment the PRD describes.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const handoff = await loadSessionHandoff(boardId, roomId);
      if (cancelled) {
        return;
      }
      setSaved(handoff);
      setDraft(
        handoff
          ? {
              leftOff: handoff.leftOff,
              whatsNext: handoff.whatsNext,
              ownerName: handoff.ownerName,
            }
          : EMPTY,
      );

      const key = boardId ?? roomId;
      if (handoff && key && autoOpenedFor.current !== key) {
        autoOpenedFor.current = key;
        setIsOpen(true);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [boardId, roomId]);

  const handleSave = useCallback(async () => {
    setStatus("saving");
    try {
      const handoff = await saveSessionHandoff(
        boardId,
        roomId,
        draft,
        displayName ?? "",
      );
      setSaved(handoff);
      setStatus("saved");
    } catch (error) {
      console.warn("Could not save handoff:", error);
      setStatus("error");
    }
  }, [boardId, roomId, draft, displayName]);

  const update = (field: keyof typeof EMPTY) => (value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setStatus("idle");
  };

  return (
    <>
      <button
        type="button"
        className="session-handoff-trigger"
        onClick={() => setIsOpen((open) => !open)}
        title="Session Handoff"
      >
        Handoff
      </button>

      {isOpen && (
        <FloatingWindow
          title="Session Handoff"
          windowId="session-handoff"
          onClose={() => setIsOpen(false)}
          defaultSize={{ width: 380, height: 440 }}
        >
          {/* Key events stay inside the panel so they never reach Excalidraw's
              global shortcut handler (see TASK8 verification, finding 2). */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            className="session-handoff"
            onKeyDownCapture={(event) => event.stopPropagation()}
          >
            <label className="session-handoff__field">
              <span>Where we left off</span>
              <textarea
                value={draft.leftOff}
                onChange={(event) => update("leftOff")(event.target.value)}
                placeholder="Team agreed on the onboarding flow..."
                rows={3}
              />
            </label>

            <label className="session-handoff__field">
              <span>What&apos;s next</span>
              <textarea
                value={draft.whatsNext}
                onChange={(event) => update("whatsNext")(event.target.value)}
                placeholder="Review the signup flow..."
                rows={3}
              />
            </label>

            <label className="session-handoff__field">
              <span>Owner</span>
              <input
                type="text"
                value={draft.ownerName}
                onChange={(event) => update("ownerName")(event.target.value)}
                placeholder="Who owns the next step"
              />
            </label>

            <div className="session-handoff__footer">
              <button
                type="button"
                className="session-handoff__save"
                onClick={handleSave}
                disabled={status === "saving"}
              >
                {status === "saving" ? "Saving..." : "Save handoff"}
              </button>
              <span className="session-handoff__meta">
                {saved
                  ? `Updated ${formatNoteTimestamp(new Date(saved.updatedAt))}${
                      saved.updatedByName ? ` by ${saved.updatedByName}` : ""
                    }${saved.storage === "local" ? " (this browser only)" : ""}`
                  : "Not saved yet"}
              </span>
              {status === "error" && (
                <span className="session-handoff__error">
                  Could not save. Try again.
                </span>
              )}
            </div>
          </div>
        </FloatingWindow>
      )}
    </>
  );
};
