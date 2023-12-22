import mockdate from 'mockdate';
import { Decorator } from '@storybook/react';
import { MockDateWrapper } from './MockDateWrapper';

export function advanceTime(seconds?: number): void {
  const milliseconds = (seconds ?? 60) * 1000;
  const now = new Date();
  mockdate.set(new Date(now.getTime() + milliseconds));
}

export const withMockedDate: Decorator = (Story) => {
  return (
    <MockDateWrapper>
      <Story />
    </MockDateWrapper>
  );
};
