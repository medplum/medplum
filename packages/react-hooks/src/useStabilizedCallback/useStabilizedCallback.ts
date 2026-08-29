// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useInsertionEffect, useRef } from 'react';

/**
 * Returns a referentially stable wrapper around `callback` that always invokes the most recent
 * value passed in. This allows consumers to pass inline callbacks without invalidating effects
 * that depend on them.
 *
 * The returned function is always defined, even when `callback` is undefined; in that case it
 * is a no-op returning undefined. Do not use the result as a "was a handler provided?" signal.
 *
 * The returned function may not be current during rendering. Synchronous usage in renders
 * should invoke the original function instead of the stabilized wrapper.
 *
 * In React v19.2+, when the callback is only used in effects, this can be replaced with
 * `useEffectEvent`. This package supports embedding in applications using React 18.0, so that
 * technique can not be used in this library yet.
 *
 * @param callback - The callback to stabilize. May be undefined.
 * @returns A stable function that forwards to the latest `callback`.
 */
export function useStabilizedCallback<Args extends unknown[], R>(
  callback: ((...args: Args) => R) | undefined
): (...args: Args) => R | undefined {
  const callbackRef = useRef(callback);

  // useInsertionEffect runs before any layout or passive effect in the commit, including those of
  // descendants, so the ref is current by the time either kind of effect can call the wrapper.
  // It is NOT current during render, nor in a descendant's own useInsertionEffect, since insertion
  // effects commit child-first.
  useInsertionEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args: Args) => callbackRef.current?.(...args), []);
}
