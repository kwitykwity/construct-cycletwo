import Spinner from "@excalidraw/excalidraw/components/Spinner";

import "./states.scss";

interface LoadingStateProps {
  /** Optional message to display below spinner */
  message?: string;
  /** Spinner size (default: "2em") */
  size?: string;
}

/**
 * LoadingState - Displays a spinner with optional message
 *
 * Used for async data loading in History, Personal Notes, Team Notes
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  message,
  size = "2em",
}) => {
  return (
    <div className="state-container state-container--loading">
      <Spinner size={size} />
      {message && <span className="state-container__message">{message}</span>}
    </div>
  );
};
