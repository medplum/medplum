// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type sinon from 'sinon';
import { MockDateContext, createGlobalTimer } from './MockDateWrapper.utils';

export function MockDateWrapper({ children }: { children: ReactNode }): JSX.Element {
  const [clock] = useState<sinon.SinonFakeTimers>(() => createGlobalTimer());

  useEffect(() => {
    // Cleanup only
    return () => {
      clock.restore();
    };
  }, [clock]);

  const contextValue = useMemo(() => {
    const advanceSystemTime = (seconds?: number): void => {
      const milliseconds = (seconds ?? 60) * 1000;
      const now = new Date();
      clock.setSystemTime(new Date(now.getTime() + milliseconds));
    };
    return { advanceSystemTime };
  }, [clock]);

  return <MockDateContext.Provider value={contextValue}>{children}</MockDateContext.Provider>;
}
