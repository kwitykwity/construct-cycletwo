// Auth module exports
export { AuthProvider } from "./AuthProvider";
export { AuthDialog } from "./AuthDialog";
export { UserAuthButton } from "./UserAuthButton";
export { useSupabaseAuth } from "./useSupabaseAuth";
export {
  supabaseUserAtom,
  supabaseSessionAtom,
  authLoadingAtom,
  isAuthenticatedAtom,
  userProfileAtom,
  displayNameAtom,
  currentBoardIdAtom,
  authErrorAtom,
  showAuthDialogAtom,
  pendingRoomLinkAtom,
  type UserProfile,
} from "./atoms";
