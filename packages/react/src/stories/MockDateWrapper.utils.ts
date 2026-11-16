// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createContext } from 'react';
import type { SinonFakeTimers } from 'sinon';
import { useFakeTimers } from 'sinon';

export type MockDateContextType = {
  advanceSystemTime: (seconds?: number) => void;
};

// cast undefined so that attempting to use this context without the withMockedDate decorator will crash
export const MockDateContext = createContext(undefined as unknown as MockDateContextType);

export const DEFAULT_MOCKED_DATE = new Date(2020, 4, 4, 12, 5);

export function createGlobalTimer(): SinonFakeTimers {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useFakeTimers({
    now: DEFAULT_MOCKED_DATE,
    shouldAdvanceTime: false,
    toFake: ['Date'],
    // Storybook bundles a separate copy of sinon per package, and it loads the next story's
    // module before tearing down the current one. Without `global`, fake-timers captures the
    // "native" Date at module load, which may be another copy's fake Date. Faking on top of
    // a fake Date throws "Cannot redefine property: constructor". Passing `global` makes it
    // capture Date at install time instead. sinon honors this option but its typings omit it.
    global: globalThis,
  } as Parameters<typeof useFakeTimers>[0]);
}
