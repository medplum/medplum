import { useCallback, useDebugValue, useMemo, useState } from 'react';

type SetStateType<T> = T | ((prev: T) => T);
type CallBackType<T> = (updatedValue: T) => void;

/**
 * A wrapper around the useState hook with an optional onChange callback.
 *
 * Mostly based on [1], but inspired by [2] to make the callback function a "dumb"
 * callback and have no bearing on whether the invocation of setState actually
 * updates the underlying state
 *
 * [1]. https://github.com/theKashey/use-callback-state
 * [2]. https://medium.com/geekculture/usecallbackstate-the-hook-that-let-you-run-code-after-a-setstate-operation-finished-25f40db56661
 * @param options - An object
 * @param options.initialState - The value you want the state to be initially. It can be a value of any type, but there is a special behavior for functions. This argument is ignored after the initial render.
 * @param options.debugMode - enable debug console messages
 * @param options.debugName - name to be used in debug messages
 * @returns [state, setState]
 */
function useCallbackState<T>({
  initialState,
  debugMode,
  debugName,
}: {
  /** The value you want the state to be initially. It can be a value of any type, but there is a special behavior for functions. This argument is ignored after the initial render.*/
  initialState: T | (() => T);
  /** (optional) - enable debug console messages */
  debugMode?: boolean;
  /** (optional) - name to be used in debug messages */
  debugName?: string;
}): [T, (newValue: SetStateType<T>, callback?: CallBackType<T>) => void] {
  const [state, setState] = useState<T>(initialState);
  const debug = useMemo(() => {
    if (!debugMode) {
      return () => undefined;
    }

    const debug = (...args: any[]): void => {
      console.debug(debugName ? `useCallbackState[${debugName}]` : 'useCallbackState', ...args);
    };
    return debug;
  }, [debugMode, debugName]);

  const setStateWithCallback = useCallback(
    (newValue: SetStateType<T>, callback?: CallBackType<T>): void => {
      if (callback === undefined) {
        debug('set without callback', typeof newValue === 'function' ? newValue.toString() : JSON.stringify(newValue));
        setState(newValue);
      } else {
        setState((oldValue) => {
          debug('set', typeof newValue === 'function' ? newValue.toString() : JSON.stringify(newValue));
          //@ts-expect-error typescript doesn't like this type-narrowing, see https://github.com/microsoft/TypeScript/issues/37663
          const appliedState = typeof newValue === 'function' ? newValue(oldValue) : newValue;
          if (callback && typeof callback === 'function') {
            debug('invoking callback', JSON.stringify(appliedState));
            callback(appliedState);
          }
          return appliedState;
        });
      }
    },
    [debug]
  );
  useDebugValue(state);
  return [state, setStateWithCallback];
}

export default useCallbackState;
