import { useCallback, useEffect, useRef, useState } from 'react';

type SetStateType<T> = T | ((prev: T) => T);
type CallBackType<T> = (updatedValue: T) => void;

function useCallbackState<T>(
  initialState: T | (() => T),
  name?: string
): [T, (newValue: SetStateType<T>, callback?: CallBackType<T>) => void] {
  const [state, _setState] = useState<T>(initialState);
  const callbackQueue = useRef<CallBackType<T>[]>([]);
  const callbackFunc = useRef<CallBackType<T> | undefined>(undefined);
  const isFirstRunRef = useRef(true);
  const initialStateRef = useRef(state);
  const debugLabel = name ? `useCallbackState[${name}]` : 'useCallbackState';

  useEffect(() => {
    if (isFirstRunRef.current) {
      console.debug(
        `${debugLabel} effect SKIP FIRST`,
        JSON.stringify(initialStateRef.current),
        JSON.stringify(state),
        initialStateRef.current === state
      );
      isFirstRunRef.current = false;
      return;
    }
    if (typeof callbackFunc.current === 'function') {
      console.debug(`${debugLabel} effect`, JSON.stringify(state));
      callbackFunc.current(state);
    }
  }, [debugLabel, state]);

  const setState = useCallback(
    (newValue: SetStateType<T>, callback?: CallBackType<T>): void => {
      console.debug(
        `${debugLabel} set`,
        typeof newValue === 'function' ? newValue.toString() : JSON.stringify(newValue)
      );
      _setState(newValue);
      callbackFunc.current = callback;
      if (callback && typeof callback === 'function') {
        callbackQueue.current.push(callback);
      }
    },
    [debugLabel]
  );
  return [state, setState];
}

export default useCallbackState;
