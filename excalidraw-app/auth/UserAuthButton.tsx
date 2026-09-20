import { useCallback, useState, useRef, useEffect } from "react";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";

import { useAtomValue } from "../app-jotai";

import { useSupabaseAuth } from "./useSupabaseAuth";
import { isAuthenticatedAtom, authLoadingAtom, displayNameAtom } from "./atoms";

import "./UserAuthButton.scss";

/**
 * UserAuthButton - Shows sign-in button or user menu
 *
 * Per PRD Section 4:
 * - Display name is first name + last initial (3.3, 11.9)
 * - Sign-out available when authenticated (4.5)
 */
export const UserAuthButton = () => {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const isLoading = useAtomValue(authLoadingAtom);
  const displayName = useAtomValue(displayNameAtom);
  const { openAuthDialog, signOut } = useSupabaseAuth();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMenu]);

  const handleSignOut = useCallback(async () => {
    setShowMenu(false);
    await signOut();
  }, [signOut]);

  // Show loading state instead of hiding completely
  if (isLoading) {
    return (
      <span
        className="user-auth-button"
        style={{ opacity: 0.5, padding: "0.5rem" }}
      >
        Loading...
      </span>
    );
  }

  // Show sign-in button when not authenticated
  if (!isAuthenticated) {
    return (
      <FilledButton
        className="user-auth-button"
        label="Sign In"
        onClick={openAuthDialog}
        variant="outlined"
        size="medium"
      />
    );
  }

  // Show user menu when authenticated
  return (
    <div className="user-auth-menu" ref={menuRef}>
      <button
        className="user-auth-menu__trigger"
        onClick={() => setShowMenu(!showMenu)}
        aria-expanded={showMenu}
        aria-haspopup="true"
      >
        <span className="user-auth-menu__avatar">
          {displayName?.charAt(0).toUpperCase() || "?"}
        </span>
        <span className="user-auth-menu__name">{displayName || "User"}</span>
      </button>

      {showMenu && (
        <div className="user-auth-menu__dropdown">
          <div className="user-auth-menu__header">
            Signed in as <strong>{displayName}</strong>
          </div>
          <button className="user-auth-menu__item" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};
