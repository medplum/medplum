// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { SinonFakeTimers } from 'sinon';
// Renamed on import so eslint's react-hooks rule doesn't treat it as a hook.
import { useFakeTimers as createFakeClock } from 'sinon';

const MOCKED_DATE = new Date(2020, 4, 4, 12, 5);

// Renders children only once the clock is frozen, so their first render sees the
// mocked date rather than the real one.
export function MockDateWrapper({ children }: { children: ReactNode }): JSX.Element | null {
  const [ready, setReady] = useState(false);
  const clockRef = useRef<SinonFakeTimers>(undefined);
  useEffect(() => {
    clockRef.current = createFakeClock({ now: MOCKED_DATE, shouldAdvanceTime: false, toFake: ['Date'] });
    setReady(true);
    return () => clockRef.current?.restore();
  }, []);

  return ready ? <>{children}</> : null;
}
