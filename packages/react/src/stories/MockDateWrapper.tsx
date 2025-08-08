// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { JSX, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import sinon from 'sinon';
import { MockDateContext, createGlobalTimer } from './MockDateWrapper.utils';

export function MockDateWrapper({ children }: { children: ReactNode }): JSX.Element | null {
  const [ready, setReady] = useState(false);
  const clockRef = useRef<sinon.SinonFakeTimers>(undefined);
  useEffect(() => {
    clockRef.current = createGlobalTimer();
    setReady(true);
    return () => {
      if (clockRef.current) {
        clockRef.current.restore();
      }
    };
  }, []);

  const contextValue = useMemo(() => {
    const advanceSystemTime = (seconds?: number): void => {
      if (!clockRef.current) {
        throw new Error('should not happen');
      }
      const milliseconds = (seconds ?? 60) * 1000;
      const now = new Date();
      clockRef.current.setSystemTime(new Date(now.getTime() + milliseconds));
    };
    return { advanceSystemTime };
  }, []);

  if (!ready) {
    return null;
  }

  return <MockDateContext.Provider value={contextValue}>{children}</MockDateContext.Provider>;
}
