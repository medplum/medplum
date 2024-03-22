import { useEffect, useRef } from 'react';

/**
 * React Hook to keep track of the passed-in value from the previous render of the containing component.
 * @param value - The value to track.
 * @returns The value passed in from the previous render.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}
