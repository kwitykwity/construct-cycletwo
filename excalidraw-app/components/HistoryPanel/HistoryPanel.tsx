import { useCallback, useEffect, useRef, useState } from "react";

import { useAtomValue } from "../../app-jotai";
import { currentBoardIdAtom, isAuthenticatedAtom } from "../../auth/atoms";
import { loadActorProfiles, loadHistoryEvents } from "../../data/historyEvents";
import {
  formatDisplayName,
  formatTime,
  getRelativeDateLabel,
} from "../../utils/formatters";
import { FloatingWindow } from "../FloatingWindow";
import { EmptyState, ErrorState, LoadingState } from "../states";

import "./HistoryPanel.scss";

import type { HistoryEvent as PersistedEvent } from "../../data/historyEvents";

const GROUP_WINDOW_MS = 15 * 60 * 1000;

const TYPE_LABELS: Record<string, string> = {
  rectangle: "rectangle",
  ellipse: "ellipse",
  diamond: "diamond",
  arrow: "arrow",
  line: "line",
  text: "text",
  freedraw: "drawing",
  image: "image",
  frame: "frame",
};

const describeTypes = (elementTypes: Record<string, number> | null): string => {
  if (!elementTypes) {
    return "elements";
  }
  const entries = Object.entries(elementTypes).filter(([, n]) => n > 0);
  if (entries.length === 0) {
    return "elements";
  }
  if (entries.length === 1) {
    const [type, count] = entries[0];
    const label = TYPE_LABELS[type] ?? "element";
    if (count === 1) {
      return `${label}`;
    }
    return `${count} ${label}s`;
  }
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  return `${total} elements`;
};

const describeEvent = (event: DisplayEvent): string => {
  const target = describeTypes(event.elementTypes);
  return `${event.action} ${target}`;
};

interface DisplayEvent extends PersistedEvent {
  actorLabel?: string;
}

interface TimeGroup {
  /** Newest event's timestamp - the group's anchor time. */
  groupTime: number;
  events: DisplayEvent[];
}

const buildSections = (events: DisplayEvent[]): [string, TimeGroup[]][] => {
  const bySection = new Map<string, TimeGroup[]>();

  for (const event of events) {
    const date = new Date(event.createdAt);
    const label = getRelativeDateLabel(date);
    const list = bySection.get(label) ?? [];

    const last = list[list.length - 1];
    if (last && last.groupTime - date.getTime() <= GROUP_WINDOW_MS) {
      last.events.push(event);
    } else {
      list.push({ groupTime: date.getTime(), events: [event] });
    }
    bySection.set(label, list);
  }

  return Array.from(bySection.entries());
};

export const HistoryPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<[string, TimeGroup[]][]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("history-panel-collapsed");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const loadToken = useRef(0);

  const boardId = useAtomValue(currentBoardIdAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);

  const load = useCallback(async () => {
    if (!boardId || !isAuthenticated) {
      setSections([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const token = ++loadToken.current;
    setIsLoading(true);
    setError(null);

    try {
      const events = await loadHistoryEvents(boardId);
      if (token !== loadToken.current) {
        return;
      }

      const profiles = await loadActorProfiles(
        events.map((event) => event.actorId),
      );
      if (token !== loadToken.current) {
        return;
      }

      const withActors: DisplayEvent[] = events.map((event) => {
        const profile = profiles.get(event.actorId);
        return {
          ...event,
          actorLabel: profile
            ? formatDisplayName(profile.firstName, profile.lastName)
            : undefined,
        };
      });

      setSections(buildSections(withActors));
    } catch (err) {
      if (token === loadToken.current) {
        setError(
          err instanceof Error ? err.message : "Could not load History.",
        );
      }
    } finally {
      if (token === loadToken.current) {
        setIsLoading(false);
      }
    }
  }, [boardId, isAuthenticated]);

  // Load whenever the resolved board or auth state changes.
  useEffect(() => {
    load();
  }, [load]);

  // Re-sync when the panel opens so it reflects the latest activity.
  useEffect(() => {
    if (isOpen) {
      load();
    }
  }, [isOpen, load]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  useEffect(() => {
    try {
      localStorage.setItem(
        "history-panel-collapsed",
        JSON.stringify(Array.from(collapsedGroups)),
      );
    } catch {
      // Best-effort only - collapse state is not essential.
    }
  }, [collapsedGroups]);

  let content: React.ReactNode;
  if (isLoading) {
    content = <LoadingState message="Loading History..." />;
  } else if (error) {
    content = <ErrorState message={error} onRetry={load} />;
  } else if (sections.length === 0) {
    content = <EmptyState message="No board activity yet." />;
  } else {
    content = (
      <div className="history-panel__scroll">
        {sections.map(([label, groups]) => (
          <section key={label} className="history-panel__section">
            <h4 className="history-panel__section-title">{label}</h4>
            {groups.map((group) => {
              const groupKey = `${label}-${group.groupTime}`;
              const isCollapsed = collapsedGroups.has(groupKey);
              return (
                <div key={groupKey} className="history-panel__group">
                  <button
                    type="button"
                    className="history-panel__group-header"
                    onClick={() => toggleGroup(groupKey)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className="history-panel__group-time">
                      {formatTime(new Date(group.groupTime))}
                    </span>
                    <span className="history-panel__group-count">
                      {group.events.length}{" "}
                      {group.events.length === 1 ? "action" : "actions"}
                    </span>
                    <span
                      className={`history-panel__chevron ${
                        isCollapsed ? "history-panel__chevron--collapsed" : ""
                      }`}
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </button>
                  {!isCollapsed && (
                    <ul className="history-panel__list">
                      {group.events.map((event) => (
                        <li key={event.id} className="history-panel__item">
                          <span className="history-panel__actor">
                            {event.actorLabel ?? "Team member"}
                          </span>
                          <span className="history-panel__action">
                            {describeEvent(event)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="history-panel-trigger"
        onClick={() => setIsOpen((open) => !open)}
        title="Board History"
      >
        History
      </button>

      {isOpen && (
        <FloatingWindow
          title="History"
          onClose={() => setIsOpen(false)}
          defaultSize={{ width: 300, height: 400 }}
          defaultPosition={{
            x: Math.max(20, window.innerWidth - 300 - 20),
            y: 80,
          }}
        >
          {/* Key events stay inside the panel so they never reach Excalidraw's
              global shortcut handler (same pattern as SessionHandoff). */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            className="history-panel"
            onKeyDownCapture={(event) => event.stopPropagation()}
          >
            {content}
          </div>
        </FloatingWindow>
      )}
    </>
  );
};
