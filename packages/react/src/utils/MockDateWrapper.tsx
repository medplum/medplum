import mockdate from 'mockdate';
import { ReactNode, useEffect, createContext, useMemo, useState } from 'react';
import { Decorator } from '@storybook/react';

type MockDateContextType = {
  advanceSystemTime: (seconds?: number) => void;
};

// cast undefined so that attempting to use this context without the withMockedDate decorator will crash
export const MockDateContext = createContext<MockDateContextType>(undefined as unknown as MockDateContextType);

function advanceSystemTime(seconds?: number): void {
  const milliseconds = (seconds ?? 60) * 1000;
  const now = new Date();
  mockdate.set(new Date(now.getTime() + milliseconds));
}

function MockDateWrapper({ children }: { children: ReactNode }): JSX.Element | null {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    mockdate.set(new Date('2020-05-04T12:00:00.000Z'));
    setReady(true);
    return () => {
      mockdate.reset();
    };
  }, []);

  const contextValue = useMemo(() => {
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
