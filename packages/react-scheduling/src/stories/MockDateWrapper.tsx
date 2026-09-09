// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { SinonFakeTimers } from 'sinon';
// Renamed on import so eslint's react-hooks rule doesn't treat it as a hook.
import { useFakeTimers as createFakeClock } from 'sinon';

const MOCKED_DATE = new Date(2020, 4, 4, 12, 5);

let sharedClock: SinonFakeTimers | undefined;
let mountCount = 0;

// MDX docs can mount several decorated stories at once (e.g. multiple <Canvas>
// on one page), so the clock is shared and installed/restored only on the
// transition to/from zero mounted wrappers, rather than once per wrapper.
function acquireSharedClock(): void {
  if (!sharedClock) {
    sharedClock = createFakeClock({
      now: MOCKED_DATE,
      shouldAdvanceTime: false,
      toFake: ['Date'],
      // Storybook bundles a separate copy of sinon per package, and it loads the next story's
      // module before tearing down the current one. Without `global`, fake-timers captures the
      // "native" Date at module load, which may be another copy's fake Date. Faking on top of
      // a fake Date throws "Cannot redefine property: constructor". Passing `global` makes it
      // capture Date at install time instead. sinon honors this option but its typings omit it.
      global: globalThis,
    } as Parameters<typeof createFakeClock>[0]);
  }
  mountCount++;
}

function releaseSharedClock(): void {
  mountCount = Math.max(0, mountCount - 1);
  if (mountCount === 0) {
    sharedClock?.restore();
    sharedClock = undefined;
  }
}

// Renders children only once the clock is frozen, so their first render sees the
// mocked date rather than the real one.
export function MockDateWrapper({ children }: { children: ReactNode }): JSX.Element | null {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    acquireSharedClock();
    setReady(true);
    return () => releaseSharedClock();
  }, []);

  return ready ? <>{children}</> : null;
}
