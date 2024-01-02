import sinon from 'sinon';
import { ReactNode, useEffect, createContext, useMemo, useRef } from 'react';
import { Decorator } from '@storybook/react';

type MockDateContextType = {
  clock: sinon.SinonFakeTimers;
  advanceSystemTime: (seconds?: number) => void;
};

// cast undefined so that attempting to use this context without the withMockedDate decorator will crash
export const MockDateContext = createContext<MockDateContextType>(undefined as unknown as MockDateContextType);

function MockDateWrapper({ children }: { children: ReactNode }): JSX.Element {
  const clockRef = useRef<sinon.SinonFakeTimers>(sinon.useFakeTimers(new Date('2020-05-04T12:00:00.000Z')));
  const clock = clockRef.current;
  useEffect(() => {
    return () => {
      clock.restore();
    };
  }, [clock]);

  const contextValue = useMemo(() => {
    function advanceSystemTime(clock: sinon.SinonFakeTimers, seconds?: number): void {
      const milliseconds = (seconds ?? 60) * 1000;
      const now = new Date();
      clock.setSystemTime(new Date(now.getTime() + milliseconds));
    }
    return { clock, advanceSystemTime: advanceSystemTime.bind(undefined, clock) };
  }, [clock]);

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
