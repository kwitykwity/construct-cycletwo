import { useCallback, useState, useEffect } from "react";

import "./states.scss";

interface ErrorStateProps {
  /** Error message to display */
  message: string;
  /** Optional retry callback - if provided, shows retry button */
  onRetry?: () => void;
  /** Retry button label (default: "Try Again") */
  retryLabel?: string;
  /** Cooldown in ms before retry is enabled (default: 0) */
  retryCooldown?: number;
}

/**
 * ErrorState - Displays an error message with optional retry button
 *
 * Per PRD: Retryable errors should have a retry option
 * Supports cooldown period before retry is enabled (like ChatMessage pattern)
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
  message,
  onRetry,
  retryLabel = "Try Again",
  retryCooldown = 0,
}) => {
  const [canRetry, setCanRetry] = useState(retryCooldown === 0);

  useEffect(() => {
    if (retryCooldown > 0) {
      setCanRetry(false);
      const timer = setTimeout(() => {
        setCanRetry(true);
      }, retryCooldown);
      return () => clearTimeout(timer);
    }
  }, [retryCooldown, message]);

  const handleRetry = useCallback(() => {
    if (onRetry && canRetry) {
      onRetry();
    }
  }, [onRetry, canRetry]);

  return (
    <div className="state-container state-container--error">
      <span className="state-container__message state-container__message--error">
        {message}
      </span>
      {onRetry && (
        <button
          className="state-container__retry"
          onClick={handleRetry}
          disabled={!canRetry}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
};
