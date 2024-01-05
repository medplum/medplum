import { Decorator } from '@storybook/react';
import { MockDateWrapper } from './MockDateWrapper';
import { MockGQLWrapper, MockGQLWrapperProps } from './MockGQLWrapper';

export const withMockedDate: Decorator = (Story) => {
  return (
    <MockDateWrapper>
      <Story />
    </MockDateWrapper>
  );
};
export const withMockedGQL = (queryMocks: MockGQLWrapperProps['queryMocks']): Decorator => {
  return (Story) => {
    return (
      <MockGQLWrapper queryMocks={queryMocks}>
        <Story />
      </MockGQLWrapper>
    );
  };
};
