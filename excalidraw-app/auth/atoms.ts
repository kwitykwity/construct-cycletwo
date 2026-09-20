import { atom } from "../app-jotai";

import type { User, Session } from "@supabase/supabase-js";

/**
 * Auth-related Jotai atoms
 * Following the pattern in app-jotai.ts
 */

// Supabase user object (null if not authenticated)
export const supabaseUserAtom = atom<User | null>(null);

// Supabase session object (null if not authenticated)
export const supabaseSessionAtom = atom<Session | null>(null);

// Whether auth state is still loading (initial session restoration)
export const authLoadingAtom = atom<boolean>(true);

// Derived atom: is the user authenticated?
export const isAuthenticatedAtom = atom((get) => {
  return get(supabaseUserAtom) !== null && !get(authLoadingAtom);
});

// User profile from profiles table
export interface UserProfile {
  user_id: string;
  first_name: string;
  last_name: string;
}

export const userProfileAtom = atom<UserProfile | null>(null);

// Derived atom: display name (first name + last initial)
export const displayNameAtom = atom((get) => {
  const profile = get(userProfileAtom);
  if (!profile) {
    return null;
  }
  const lastInitial = profile.last_name ? profile.last_name.charAt(0) : "";
  return `${profile.first_name} ${lastInitial}`.trim();
});

// Current board context (resolved board_id from Supabase)
export const currentBoardIdAtom = atom<string | null>(null);

// Auth error message for display
export const authErrorAtom = atom<string | null>(null);

// Whether auth dialog should be shown
export const showAuthDialogAtom = atom<boolean>(false);

// Pending room link to restore after auth (stores the hash)
export const pendingRoomLinkAtom = atom<string | null>(null);
