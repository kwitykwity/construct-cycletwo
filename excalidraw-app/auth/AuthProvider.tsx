import { useEffect, useCallback } from "react";

import { useSetAtom, useAtomValue } from "../app-jotai";

import { supabase } from "../data/supabase";

import {
  supabaseUserAtom,
  supabaseSessionAtom,
  authLoadingAtom,
  userProfileAtom,
  authErrorAtom,
  pendingRoomLinkAtom,
  showAuthDialogAtom,
  type UserProfile,
} from "./atoms";
import { AuthDialog } from "./AuthDialog";

const PENDING_ROOM_LINK_KEY = "construct_pending_room_link";

/**
 * AuthProvider - Manages Supabase authentication state
 *
 * Per PRD Section 4:
 * - Restores session on app load (4.4)
 * - Preserves board context during auth flow (4.1, 4.8)
 * - Clears protected data on sign-out (4.5)
 *
 * Per PRD Section 10.12:
 * - Security identity comes from auth.uid(), never display names
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const setUser = useSetAtom(supabaseUserAtom);
  const setSession = useSetAtom(supabaseSessionAtom);
  const setAuthLoading = useSetAtom(authLoadingAtom);
  const setUserProfile = useSetAtom(userProfileAtom);
  const setAuthError = useSetAtom(authErrorAtom);
  const setPendingRoomLink = useSetAtom(pendingRoomLinkAtom);
  const showAuthDialog = useAtomValue(showAuthDialogAtom);

  /**
   * Load user profile from profiles table
   * Per PRD 4.3: Each authenticated user has first_name and last_name
   */
  const loadUserProfile = useCallback(
    async (userId: string): Promise<UserProfile | null> => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .eq("user_id", userId)
          .single();

        if (error) {
          // Profile might not exist yet (trigger may not have run)
          console.warn("Could not load profile:", error.message);
          return null;
        }

        return data as UserProfile;
      } catch (err) {
        console.error("Error loading profile:", err);
        return null;
      }
    },
    [],
  );

  /**
   * Handle session changes (sign-in, sign-out, token refresh)
   * Per PRD 4.5: Sign-out clears protected data from UI
   * Per PRD 12.6: Clear prior user/board state on sign-out
   */
  const handleSessionChange = useCallback(
    async (
      session: ReturnType<typeof supabase.auth.getSession> extends Promise<{
        data: { session: infer S };
      }>
        ? S
        : never,
    ) => {
      if (session?.user) {
        setUser(session.user);
        setSession(session);

        // Load profile data
        const profile = await loadUserProfile(session.user.id);
        setUserProfile(profile);

        // Check for pending room link to restore
        const pendingLink = sessionStorage.getItem(PENDING_ROOM_LINK_KEY);
        if (pendingLink) {
          sessionStorage.removeItem(PENDING_ROOM_LINK_KEY);
          // Restore the room hash to trigger collaboration
          if (pendingLink.startsWith("#")) {
            window.location.hash = pendingLink;
          }
        }
      } else {
        // Clear all auth state on sign-out
        setUser(null);
        setSession(null);
        setUserProfile(null);
        // Note: Board-specific data should be cleared by components
        // that subscribe to auth state changes
      }
    },
    [setUser, setSession, setUserProfile, loadUserProfile],
  );

  /**
   * Initialize auth state on mount
   * Per PRD 4.4: Restore session on app load
   * Per PRD 4.7: Auth features remain loading until session resolves
   */
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Get existing session
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          setAuthError("Could not restore session. Please sign in again.");
        }

        await handleSessionChange(session);
      } catch (_err) {
        setAuthError("Authentication error. Please try again.");
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        // Per PRD 4.5: Clear protected data
        setUser(null);
        setSession(null);
        setUserProfile(null);
        setAuthError(null);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        await handleSessionChange(session);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [
    handleSessionChange,
    setAuthLoading,
    setAuthError,
    setUser,
    setSession,
    setUserProfile,
  ]);

  /**
   * Store pending room link before auth redirect
   * Per PRD 4.1, 4.8: Return user to board context after auth
   */
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("room=")) {
      // Store for restoration after auth
      setPendingRoomLink(hash);
      sessionStorage.setItem(PENDING_ROOM_LINK_KEY, hash);
    }
  }, [setPendingRoomLink]);

  return (
    <>
      {children}
      {showAuthDialog && <AuthDialog />}
    </>
  );
};

/**
 * Hook to programmatically trigger auth dialog
 * Used when unauthenticated user tries to access protected features
 */
export const useRequireAuth = () => {
  const setShowAuthDialog = useSetAtom(showAuthDialogAtom);

  const requireAuth = useCallback(() => {
    setShowAuthDialog(true);
  }, [setShowAuthDialog]);

  return { requireAuth };
};
