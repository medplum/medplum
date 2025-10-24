// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
  This hook was forked from: https://github.com/mantinedev/mantine/blob/fbcee929e0b11782092f48c1e7af2a1d1c878823/packages/%40mantine/hooks/src/use-debounced-value/use-debounced-value.ts
  and has the following license:

  MIT License

  Copyright (c) 2021 Vitaly Rtishchev

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
*/

import { useCallback, useEffect, useRef, useState } from 'react';

export type UseDebouncedValueOptions = {
  /** Whether the first update to `value` should be immediate or not */
  leading?: boolean;
};

/**
 * This hook allows users to debounce an incoming value by a specified number of milliseconds.
 *
 * Users can also specify whether the first update to `value` in a sequence of rapid updates should be immediate, by specifying `leading: true` in the options.
 * The default value for `leading` is `false`.
 *
 * The return value is a tuple containing the debounced value at `arr[0]` and a function to cancel the pending debounced value change at `arr[1]`.
 *
 * @param value - The value to debounce.
 * @param waitMs - How long in milliseconds should.
 * @param options - Optional options for configuring the debounce.
 * @returns An array tuple of `[debouncedValue, cancelFn]`.
 */
export function useDebouncedValue<T = any>(
  value: T,
  waitMs: number,
  options: UseDebouncedValueOptions = { leading: false }
): [T, () => void] {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const mountedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cooldownRef = useRef(false);

  const cancel = useCallback(() => window.clearTimeout(timeoutRef.current), []);

  useEffect(() => {
    if (mountedRef.current) {
      if (!cooldownRef.current && options.leading) {
        cooldownRef.current = true;
        setDebouncedValue(value);
      } else {
        cancel();
        timeoutRef.current = setTimeout(() => {
          cooldownRef.current = false;
          setDebouncedValue(value);
        }, waitMs);
      }
    }
  }, [value, options.leading, waitMs, cancel]);

  useEffect(() => {
    mountedRef.current = true;
    return cancel;
  }, [cancel]);

  return [debouncedValue, cancel] as const;
}
