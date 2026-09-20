import { useCallback } from "react";

import { useAtomValue, useSetAtom } from "../app-jotai";
import { supabase } from "../data/supabase";

import {
  supabaseUserAtom,
  supabaseSessionAtom,
  authLoadingAtom,
  isAuthenticatedAtom,
  userProfileAtom,
  displayNameAtom,
  authErrorAtom,
  showAuthDialogAtom,
} from "./atoms";

export interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface SignInData {
  email: string;
  password: string;
}

/**
 * Hook for Supabase authentication operations
 *
 * Per PRD Section 4:
 * - Sign-in/sign-up with email/password (4.8)
 * - Profile capture: first_name, last_name (4.3, 4.8)
 * - Sign-out clears session (4.5)
 * - Error handling with retry (4.6)
 */
export const useSupabaseAuth = () => {
  const user = useAtomValue(supabaseUserAtom);
  const session = useAtomValue(supabaseSessionAtom);
  const isLoading = useAtomValue(authLoadingAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const profile = useAtomValue(userProfileAtom);
  const displayName = useAtomValue(displayNameAtom);
  const setAuthError = useSetAtom(authErrorAtom);
  const setShowAuthDialog = useSetAtom(showAuthDialogAtom);

  /**
   * Sign up a new user
   * Per PRD 4.8: Capture first_name, last_name during account creation
   * Profile is auto-created via database trigger (handle_new_user)
   */
  const signUp = useCallback(
    async ({ email, password, firstName, lastName }: SignUpData) => {
      try {
        setAuthError(null);

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
            },
          },
        });

        if (error) {
          // Per PRD 4.6: Clear error message for bad credentials
          if (error.message.includes("already registered")) {
            setAuthError("An account with this email already exists.");
          } else {
            setAuthError(error.message);
          }
          return { success: false, error };
        }

        // Check if email confirmation is required
        if (data.user && !data.session) {
          return {
            success: true,
            needsEmailConfirmation: true,
            user: data.user,
          };
        }

        setShowAuthDialog(false);
        return { success: true, user: data.user, session: data.session };
      } catch (err) {
        // Per PRD 4.6: Service/unexpected failures with retry message
        const message = "We couldn't create your account. Please try again.";
        setAuthError(message);
        return { success: false, error: err };
      }
    },
    [setAuthError, setShowAuthDialog],
  );

  /**
   * Sign in an existing user
   * Per PRD 4.6: Clear error for bad credentials, retryable for service errors
   */
  const signIn = useCallback(
    async ({ email, password }: SignInData) => {
      try {
        setAuthError(null);

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            setAuthError("Invalid email or password.");
          } else {
            // Per PRD 4.6: Retryable message for service errors
            setAuthError("We couldn't sign you in. Please try again.");
          }
          return { success: false, error };
        }

        setShowAuthDialog(false);
        return { success: true, user: data.user, session: data.session };
      } catch (err) {
        setAuthError("We couldn't sign you in. Please try again.");
        return { success: false, error: err };
      }
    },
    [setAuthError, setShowAuthDialog],
  );

  /**
   * Sign out the current user
   * Per PRD 4.5: Ends session, removes protected data from UI
   * Does NOT delete membership, authorship, History, or Notes
   */
  const signOut = useCallback(async () => {
    try {
      setAuthError(null);

      const { error } = await supabase.auth.signOut();

      if (error) {
        setAuthError("Could not sign out. Please try again.");
        return { success: false, error };
      }

      // Auth state change listener in AuthProvider handles cleanup
      return { success: true };
    } catch (err) {
      setAuthError("Could not sign out. Please try again.");
      return { success: false, error: err };
    }
  }, [setAuthError]);

  /**
   * Update user profile (first_name, last_name)
   * Per PRD 4.9: Profile changes update display name at render time
   */
  const updateProfile = useCallback(
    async (firstName: string, lastName: string) => {
      if (!user) {
        return { success: false, error: "Not authenticated" };
      }

      try {
        const { error } = await supabase
          .from("profiles")
          .update({
            first_name: firstName,
            last_name: lastName,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      } catch (err) {
        return { success: false, error: "Could not update profile" };
      }
    },
    [user],
  );

  /**
   * Open the auth dialog
   */
  const openAuthDialog = useCallback(() => {
    setShowAuthDialog(true);
  }, [setShowAuthDialog]);

  /**
   * Close the auth dialog
   */
  const closeAuthDialog = useCallback(() => {
    setShowAuthDialog(false);
    setAuthError(null);
  }, [setShowAuthDialog, setAuthError]);

  return {
    // State
    user,
    session,
    isLoading,
    isAuthenticated,
    profile,
    displayName,

    // Actions
    signUp,
    signIn,
    signOut,
    updateProfile,
    openAuthDialog,
    closeAuthDialog,
  };
};
