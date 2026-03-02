/**
 * Skeleton placeholder for loading states.
 * Uses animate-pulse and base-300 background for consistent appearance across themes.
 */
export function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-base-300 ${className}`}
      aria-hidden
      {...props}
    />
  );
}
