import { useEffect, useState, useCallback, useRef } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useAtomValue } from "../../app-jotai";
import { supabaseUserAtom, currentBoardIdAtom } from "../../auth";
import { supabase } from "../../data/supabase";
import { formatAuthorship } from "../../utils/formatters";

/**
 * Element Authorship hover tooltip.
 *
 * Per PRD Section 5.5:
 * - Hover resolves authorship by current board + stable element ID
 * - Displays compact format: "Rob W 11:42am 9/18/26"
 * - Missing/failed retrieval shows "Author unavailable" (PRD 5.7)
 * - Avoids a DB request on every hover (PRD 11.4) via in-memory cache
 *
 * This component does NOT subscribe to pointer events itself.
 * Instead, App.tsx calls `handleHover(elementId, viewportX, viewportY)`
 * from its `onPointerUpdate` prop chain.
 */

interface AuthorshipTooltipProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

// Cache: boardId:elementId -> formatted display string
const displayCache = new Map<string, string>();

export const AuthorshipTooltip = ({
  excalidrawAPI,
}: AuthorshipTooltipProps) => {
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const user = useAtomValue(supabaseUserAtom);
  const boardId = useAtomValue(currentBoardIdAtom);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastElementIdRef = useRef<string | null>(null);

  // Clear cache when board changes
  useEffect(() => {
    displayCache.clear();
    lastElementIdRef.current = null;
    setTooltip(null);
  }, [boardId]);

  /**
   * Called from App.tsx onPointerUpdate when hovering over an element.
   * Resolves authorship from cache or Supabase, shows tooltip.
   */
  const handleHover = useCallback(
    (elementId: string | null, viewportX: number, viewportY: number) => {
      if (!user || !boardId || !elementId) {
        setTooltip(null);
        lastElementIdRef.current = null;
        return;
      }

      if (lastElementIdRef.current === elementId) {
        return;
      }

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        lastElementIdRef.current = elementId;

        const cacheKey = `${boardId}:${elementId}`;
        const cached = displayCache.get(cacheKey);
        if (cached !== undefined) {
          setTooltip({ text: cached, x: viewportX, y: viewportY });
          return;
        }

        // Fetch authorship + profile from Supabase
        (async () => {
          try {
            const { data, error } = await supabase
              .from("element_authorship")
              .select("created_by, created_at")
              .eq("board_id", boardId)
              .eq("element_id", elementId)
              .maybeSingle();

            if (error || !data) {
              displayCache.set(cacheKey, "Author unavailable");
              setTooltip({
                text: "Author unavailable",
                x: viewportX,
                y: viewportY,
              });
              return;
            }

            const { data: profile } = await supabase
              .from("profiles")
              .select("first_name, last_name")
              .eq("user_id", data.created_by)
              .single();

            const text = profile
              ? formatAuthorship(
                  profile.first_name,
                  profile.last_name,
                  new Date(data.created_at),
                )
              : "Author unavailable";

            displayCache.set(cacheKey, text);
            setTooltip({ text, x: viewportX, y: viewportY });
          } catch {
            displayCache.set(cacheKey, "Author unavailable");
            setTooltip({
              text: "Author unavailable",
              x: viewportX,
              y: viewportY,
            });
          }
        })();
      }, 200);
    },
    [user, boardId],
  );

  // Expose handleHover via ref-like pattern so App.tsx can call it
  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    // Store the handler on the API object for App.tsx to access
    (excalidrawAPI as any).__authorshipHover = handleHover;
    return () => {
      delete (excalidrawAPI as any).__authorshipHover;
    };
  }, [excalidrawAPI, handleHover]);

  if (!tooltip) {
    return null;
  }

  return (
    <div
      className="authorship-tooltip"
      style={{
        position: "absolute",
        left: tooltip.x,
        top: tooltip.y + 20,
        background: "var(--color-surface-high, #fff)",
        border: "1px solid var(--color-border, #ddd)",
        borderRadius: 6,
        padding: "4px 8px",
        fontSize: 12,
        fontFamily: "system-ui, sans-serif",
        color: "var(--color-text, #333)",
        pointerEvents: "none",
        zIndex: 1000,
        whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      {tooltip.text}
    </div>
  );
};
