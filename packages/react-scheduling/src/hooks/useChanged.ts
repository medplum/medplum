// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';

/**
 * Whether `value` differs from the one seen on the last render, so state can be adjusted
 * while rendering instead of in an effect a commit later. Compared with `Object.is`, so
 * pass a primitive (`date.getTime()`) for anything a host builds fresh each render.
 * @param value - The value to watch.
 * @returns True on the one render that sees a new value.
 */
export function useChanged<T>(value: T): boolean {
  const [seen, setSeen] = useState(value);
  if (!Object.is(seen, value)) {
    setSeen(value);
    return true;
  }
  return false;
}
