import "./states.scss";

interface EmptyStateProps {
  /** Message to display when empty */
  message: string;
  /** Optional icon to display above message */
  icon?: React.ReactNode;
}

/**
 * EmptyState - Displays a message when no data is available
 *
 * Used for empty History, no notes, etc.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ message, icon }) => {
  return (
    <div className="state-container state-container--empty">
      {icon && <div className="state-container__icon">{icon}</div>}
      <span className="state-container__message state-container__message--empty">
        {message}
      </span>
    </div>
  );
};
