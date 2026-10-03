import { useState, useCallback, useEffect } from "react";

import { useAtomValue } from "../app-jotai";

import { useSupabaseAuth } from "./useSupabaseAuth";
import { authErrorAtom, passwordRecoveryAtom } from "./atoms";

import "./AuthDialog.scss";

type AuthMode = "signIn" | "signUp" | "resetPassword";

/**
 * Simple modal wrapper that doesn't depend on Excalidraw context
 */
const SimpleModal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div
        className="auth-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <div className="auth-modal__header">
          <h2 id="auth-modal-title">{title}</h2>
          <button
            className="auth-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="auth-modal__content">{children}</div>
      </div>
    </div>
  );
};

/**
 * AuthDialog - Sign-in/Sign-up modal
 *
 * Per PRD Section 4:
 * - Account creation captures first_name, last_name, email (4.8)
 * - Passwords remain only in Supabase Auth (4.8)
 * - Clear error messages for bad credentials (4.6)
 * - Retryable errors for service failures (4.6)
 */
export const AuthDialog = () => {
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const authError = useAtomValue(authErrorAtom);
  const passwordRecovery = useAtomValue(passwordRecoveryAtom);
  const { signIn, signUp, signOut, resetPassword, updatePassword, openAuthDialog, closeAuthDialog } = useSupabaseAuth();

  const handleClose = useCallback(() => {
    closeAuthDialog();
  }, [closeAuthDialog]);
  const handleResetPassword = useCallback(async () => {
    if (!email.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await resetPassword(email.trim());
      if (result.success) {
        setResetEmailSent(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [email, isSubmitting, resetPassword]);
  const handleUpdatePassword = useCallback(async () => {
  if (newPassword !== confirmPassword) {
  return;
 }  
  if (newPassword.length < 6 || isSubmitting) {
    return;
  }

  setIsSubmitting(true);

  try {
    const result = await updatePassword(newPassword);
    if (result.success) {
  setPasswordUpdated(true);
  await signOut();
  openAuthDialog();
}
  } finally {
    setIsSubmitting(false);
  }
}, [newPassword, confirmPassword, isSubmitting, updatePassword, signOut, openAuthDialog]);
  const handleSubmit = useCallback(async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "signIn") {
        const result = await signIn({ email, password });
        if (result.success) {
          // Dialog closes automatically via signIn
        }
      } else {
        const result = await signUp({
          email,
          password,
          firstName,
          lastName,
        });
        if (result.success) {
          if (result.needsEmailConfirmation) {
            setNeedsEmailConfirmation(true);
          }
          // Dialog closes automatically via signUp if no confirmation needed
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    mode,
    email,
    password,
    firstName,
    lastName,
    signIn,
    signUp,
    isSubmitting,
  ]);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "signIn" ? "signUp" : "signIn"));
    setNeedsEmailConfirmation(false);
  }, []);

  const isFormValid =
    mode === "signIn"
      ? email.trim() !== "" && password.length >= 6
      : email.trim() !== "" &&
        password.length >= 6 &&
        firstName.trim() !== "" &&
        lastName.trim() !== "";

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && isFormValid && !isSubmitting) {
        handleSubmit();
      }
    },
    [isFormValid, isSubmitting, handleSubmit],
  );

  // Email confirmation success state
  if (needsEmailConfirmation) {
    return (
      <SimpleModal title="Check your email" onClose={handleClose}>
        <div className="auth-dialog">
          <div className="auth-dialog__message">
            <p>
              We sent a confirmation link to <strong>{email}</strong>.
            </p>
            <p>
              Please check your email and click the link to complete signup.
            </p>
          </div>
          <button className="auth-dialog__button" onClick={handleClose}>
            Close
          </button>
        </div>
      </SimpleModal>
    );
  }
  if (resetEmailSent) {
    return (
      <SimpleModal title="Check your email" onClose={handleClose}>
        <div className="auth-dialog">
          <div className="auth-dialog__message">
            <p>
              If an account exists for <strong>{email}</strong>, we sent a
              password reset link.
            </p>
            <p>
              Please check your email and click the link to reset your password.
            </p>
          </div>
          <button className="auth-dialog__button" onClick={handleClose}>
            Close
          </button>
        </div>
      </SimpleModal>
    );
  }
  if (passwordRecovery && !passwordUpdated) {
  const passwordsMatch =
    newPassword.length > 0 && newPassword === confirmPassword;

  return (
    <SimpleModal title="Set new password" onClose={handleClose}>
      <div className="auth-dialog">
        <div className="auth-dialog__field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter your new password"
          />
        </div>

        <div className="auth-dialog__field">
          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Enter your new password again"
          />
        </div>

        {confirmPassword.length > 0 && !passwordsMatch && (
          <div className="auth-dialog__error">
            Passwords do not match.
          </div>
        )}

        <button
          className="auth-dialog__button"
          onClick={handleUpdatePassword}
          disabled={
            newPassword.length < 6 ||
            !passwordsMatch ||
            isSubmitting
          }
        >
          {isSubmitting ? "Updating..." : "Update Password"}
        </button>
      </div>
    </SimpleModal>
  );
}
  return (
    <SimpleModal
      title={mode === "signIn" ? "Sign In" : "Create Account"}
      onClose={handleClose}
    >
      <div className="auth-dialog" onKeyDown={handleKeyDown}>
        {authError && (
          <div className="auth-dialog__error" role="alert">
            {authError}
          </div>
        )}

        {mode === "signUp" && (
          <>
            <div className="auth-dialog__field">
              <label htmlFor="auth-firstName">First Name</label>
              <input
                id="auth-firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter your first name"
                autoComplete="given-name"
              />
            </div>

            <div className="auth-dialog__field">
              <label htmlFor="auth-lastName">Last Name</label>
              <input
                id="auth-lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter your last name"
                autoComplete="family-name"
              />
            </div>
          </>
        )}

        <div className="auth-dialog__field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            autoComplete="email"
          />
        </div>

        <div className="auth-dialog__field">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              mode === "signUp"
                ? "At least 6 characters"
                : "Enter your password"
            }
            autoComplete={
              mode === "signUp" ? "new-password" : "current-password"
            }
          />
        </div>
        {mode === "signIn" && !email.trim() && (
  <div className="auth-dialog__message">
    Enter your email above to reset your password.
  </div>
)}
        {mode === "signIn" && (
          <div className="auth-dialog__toggle">
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={!email.trim() || isSubmitting}
            >
              Forgot password?
            </button>
          </div>
        )}
        <button
          className="auth-dialog__button"
          onClick={handleSubmit}
          disabled={!isFormValid || isSubmitting}
        >
          {isSubmitting
            ? "Please wait..."
            : mode === "signIn"
            ? "Sign In"
            : "Create Account"}
        </button>

        <div className="auth-dialog__toggle">
          {mode === "signIn" ? (
            <span>
              Don&apos;t have an account?{" "}
              <button type="button" onClick={toggleMode}>
                Create one
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{" "}
              <button type="button" onClick={toggleMode}>
                Sign in
              </button>
            </span>
          )}
        </div>
      </div>
    </SimpleModal>
  );
};
