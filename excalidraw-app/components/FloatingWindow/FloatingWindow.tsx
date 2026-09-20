import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import "./FloatingWindow.scss";

interface Position {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

export interface FloatingWindowProps {
  /** Window title displayed in header */
  title: string;
  /** Window content */
  children: React.ReactNode;
  /** Called when close button is clicked */
  onClose: () => void;
  /** Unique ID for localStorage persistence */
  windowId?: string;

  /** Initial position (default: centered) */
  defaultPosition?: Position;
  /** Initial size */
  defaultSize?: Size;
  /** Minimum size constraints */
  minSize?: Size;
  /** Maximum size constraints */
  maxSize?: Size;

  /** Enable dragging (default: true) */
  draggable?: boolean;
  /** Enable resizing (default: true) */
  resizable?: boolean;
}

const DEFAULT_MIN_SIZE: Size = { width: 200, height: 150 };
const DEFAULT_MAX_SIZE: Size = { width: 800, height: 600 };
const VIEWPORT_PADDING = 20;

/**
 * FloatingWindow - A draggable, resizable window component
 *
 * Used for History Panel, Personal Notes, Team Notes
 * Per PRD: Movable within viewport, resizable, X to close
 */
export const FloatingWindow: React.FC<FloatingWindowProps> = ({
  title,
  children,
  onClose,
  windowId,
  defaultPosition,
  defaultSize = { width: 350, height: 400 },
  minSize = DEFAULT_MIN_SIZE,
  maxSize = DEFAULT_MAX_SIZE,
  draggable = true,
  resizable = true,
}) => {
  const windowRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>(() => {
    // Try to load from localStorage
    if (windowId) {
      const saved = localStorage.getItem(
        `floating-window-${windowId}-position`,
      );
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // Ignore parse errors
        }
      }
    }
    // Default to centered or provided position
    if (defaultPosition) {
      return defaultPosition;
    }
    return {
      x: Math.max(
        VIEWPORT_PADDING,
        (window.innerWidth - defaultSize.width) / 2,
      ),
      y: Math.max(
        VIEWPORT_PADDING,
        (window.innerHeight - defaultSize.height) / 2,
      ),
    };
  });

  const [size, setSize] = useState<Size>(() => {
    // Try to load from localStorage
    if (windowId) {
      const saved = localStorage.getItem(`floating-window-${windowId}-size`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // Ignore parse errors
        }
      }
    }
    return defaultSize;
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef<Position>({ x: 0, y: 0 });
  const resizeStart = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  // Save position to localStorage
  useEffect(() => {
    if (windowId && !isDragging) {
      localStorage.setItem(
        `floating-window-${windowId}-position`,
        JSON.stringify(position),
      );
    }
  }, [windowId, position, isDragging]);

  // Save size to localStorage
  useEffect(() => {
    if (windowId && !isResizing) {
      localStorage.setItem(
        `floating-window-${windowId}-size`,
        JSON.stringify(size),
      );
    }
  }, [windowId, size, isResizing]);

  // Constrain position to viewport
  const constrainPosition = useCallback(
    (pos: Position): Position => {
      const maxX = window.innerWidth - size.width - VIEWPORT_PADDING;
      const maxY = window.innerHeight - size.height - VIEWPORT_PADDING;
      return {
        x: Math.max(VIEWPORT_PADDING, Math.min(pos.x, maxX)),
        y: Math.max(VIEWPORT_PADDING, Math.min(pos.y, maxY)),
      };
    },
    [size],
  );

  // Constrain size
  const constrainSize = useCallback(
    (s: Size): Size => {
      return {
        width: Math.max(minSize.width, Math.min(s.width, maxSize.width)),
        height: Math.max(minSize.height, Math.min(s.height, maxSize.height)),
      };
    },
    [minSize, maxSize],
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!draggable) {
        return;
      }
      e.preventDefault();
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [draggable, position],
  );

  // Handle resize start
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (!resizable) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: size.width,
        height: size.height,
      };
    },
    [resizable, size],
  );

  // Handle mouse move for drag/resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newPosition = constrainPosition({
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y,
        });
        setPosition(newPosition);
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStart.current.x;
        const deltaY = e.clientY - resizeStart.current.y;
        const newSize = constrainSize({
          width: resizeStart.current.width + deltaX,
          height: resizeStart.current.height + deltaY,
        });
        setSize(newSize);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, isResizing, constrainPosition, constrainSize]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Reposition if window goes off-screen on resize
  useEffect(() => {
    const handleWindowResize = () => {
      setPosition((prev) => constrainPosition(prev));
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [constrainPosition]);

  const windowContent = (
    <div
      ref={windowRef}
      className={`floating-window ${
        isDragging ? "floating-window--dragging" : ""
      } ${isResizing ? "floating-window--resizing" : ""}`}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }}
      role="dialog"
      aria-labelledby={`floating-window-title-${windowId || "default"}`}
    >
      <div
        className="floating-window__header"
        onMouseDown={handleDragStart}
        style={{ cursor: draggable ? "move" : "default" }}
      >
        <h3
          className="floating-window__title"
          id={`floating-window-title-${windowId || "default"}`}
        >
          {title}
        </h3>
        <button
          className="floating-window__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="floating-window__content">{children}</div>

      {resizable && (
        <div
          className="floating-window__resize-handle"
          onMouseDown={handleResizeStart}
        />
      )}
    </div>
  );

  return createPortal(windowContent, document.body);
};
