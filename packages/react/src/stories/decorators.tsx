import { Decorator } from '@storybook/react';
import { MockDateWrapper } from './MockDateWrapper';

export const withMockedDate: Decorator = (Story) => {
  return (
    <MockDateWrapper>
      <Story />
    </MockDateWrapper>
  );
};
