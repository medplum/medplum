// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ControllableItemsOptions {
  /** The component named in the warning about switching between controlled and uncontrolled. */
  readonly component: string;
  readonly name?: string;
  /** At 0, edits are reported without being kept. */
  readonly maxValues?: number;
}

/**
 * Holds the selection of an input that is controlled while `value` is defined. Changing `value` to
 * undefined makes it uncontrolled, keeping the last selection, as a native `<input>` does.
 * @param value - The controlled selection, or undefined when uncontrolled.
 * @param defaultValue - The initial uncontrolled selection.
 * @param options - Names for the mode-switch warning, and the input's `maxValues`.
 * @returns The selection to show, and a setter for edits that only applies them when uncontrolled.
 */
export function useControllableItems<V>(
  value: readonly V[] | undefined,
  defaultValue: readonly V[] | (() => readonly V[]),
  options: ControllableItemsOptions
): [readonly V[], (items: readonly V[]) => void] {
  const { component, name, maxValues } = options;
  const [uncontrolledItems, setUncontrolledItems] = useState(defaultValue);
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value === undefined) {
      setUncontrolledItems(prevValue ?? []);
    }
  }
  const controlled = value !== undefined;
  useWarnOnModeSwitch(controlled, component, name);
  const setItems = useCallback(
    (items: readonly V[]): void => {
      if (!controlled) {
        setUncontrolledItems(maxValues === 0 ? [] : items);
      }
    },
    [controlled, maxValues]
  );
  return [value ?? uncontrolledItems, setItems];
}

function useWarnOnModeSwitch(controlled: boolean, component: string, name: string | undefined): void {
  const controlledRef = useRef(controlled);
  const warnedRef = useRef(false);
  useEffect(() => {
    if (import.meta.env.NODE_ENV !== 'production' && controlled !== controlledRef.current && !warnedRef.current) {
      warnedRef.current = true;
      console.warn(
        `${component}${name ? ` "${name}"` : ''} switched from ${controlled ? 'uncontrolled to controlled' : 'controlled to uncontrolled'}` +
          ' because `value` changed to or from undefined. Pass null or [] for an empty controlled value.'
      );
    }
    controlledRef.current = controlled;
  }, [controlled, component, name]);
}
