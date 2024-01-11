import { createContext } from 'react';
import sinon from 'sinon';

export type MockDateContextType = {
  advanceSystemTime: (seconds?: number) => void;
};

// cast undefined so that attempting to use this context without the withMockedDate decorator will crash
export const MockDateContext = createContext<MockDateContextType>(undefined as unknown as MockDateContextType);

export const DEFAULT_MOCKED_DATE = new Date(2020, 4, 4, 12, 5);

export function createGlobalTimer(): sinon.SinonFakeTimers {
  return sinon.useFakeTimers({
    now: DEFAULT_MOCKED_DATE,
    shouldAdvanceTime: false,
    toFake: ['Date'],
  });
}
