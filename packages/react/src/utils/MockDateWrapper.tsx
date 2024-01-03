import sinon from 'sinon';
import { ReactNode, useEffect, createContext, useMemo, useState, useRef } from 'react';
import { Decorator } from '@storybook/react';

type MockDateContextType = {
  advanceSystemTime: (seconds?: number) => void;
};

// cast undefined so that attempting to use this context without the withMockedDate decorator will crash
export const MockDateContext = createContext<MockDateContextType>(undefined as unknown as MockDateContextType);

function MockDateWrapper({ children }: { children: ReactNode }): JSX.Element | null {
  const [ready, setReady] = useState(false);
  const clockRef = useRef<sinon.SinonFakeTimers>();
  useEffect(() => {
    clockRef.current = sinon.useFakeTimers({
      now: new Date(2020, 5, 4, 12, 5),
      shouldAdvanceTime: false,
      toFake: ['Date'],
    });
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

// eslint-disable-next-line react-refresh/only-export-components
export const withMockedDate: Decorator = (Story) => {
  return (
    <MockDateWrapper>
      <Story />
    </MockDateWrapper>
  );
};
