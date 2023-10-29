import { useEffect, useRef } from 'react';

const clientId = crypto.randomUUID();

export function useClientId(): string {
  return clientId;
}

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: We want this to run on every render
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}
