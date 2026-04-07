import { useEffect, useState } from 'react';

/**
 * Custom hook to show a loading indicator only after a specified delay.
 * Useful for preventing loading flashes for quick operations while still
 * providing feedback for longer-running tasks.
 *
 * @param isLoading - The loading state to monitor
 * @param delay - Delay in milliseconds before showing the indicator (default: 5000)
 * @returns boolean indicating whether to show the delayed loading indicator
 *
 * @example
 * ```tsx
 * const showLoadingIndicator = useDelayedLoadingIndicator(isLoading);
 *
 * return (
 *   <>
 *     {isLoading && <CircleProgress />}
 *     {showLoadingIndicator && (
 *       <Typography>Taking longer than expected...</Typography>
 *     )}
 *   </>
 * );
 * ```
 */
export const useDelayedLoadingIndicator = (
  isLoading: boolean,
  delay: number = 5000
): boolean => {
  const [showLoadingIndicator, setShowLoadingIndicator] =
    useState<boolean>(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isLoading) {
      // Set a timer to show loading indicator after the specified delay
      timer = setTimeout(() => {
        setShowLoadingIndicator(true);
      }, delay);
    } else {
      // Reset the indicator when loading completes
      setShowLoadingIndicator(false);
    }

    // Clean up timer on unmount or when isLoading changes
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isLoading, delay]);

  return showLoadingIndicator;
};
