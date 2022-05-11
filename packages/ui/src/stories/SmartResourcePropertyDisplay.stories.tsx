import React from 'react';
import { SmartResourcePropertyDisplay, SmartResourcePropertyDisplayProps } from '../SmartResourcePropertyDisplay';
import { HomerServiceRequest, HomerSimpson } from '@medplum/mock';
import { ComponentStory, Meta } from '@storybook/react';

export default {
  component: SmartResourcePropertyDisplay,
  title: 'Medplum/SmartResourcePropertyDisplay',
} as Meta;

const Story: ComponentStory<typeof SmartResourcePropertyDisplay> = (args: SmartResourcePropertyDisplayProps) => (
  <SmartResourcePropertyDisplay {...args} />
);

export const Id = Story.bind({});
Id.args = {
  path: 'id',
  resource: HomerServiceRequest,
};

export const ArrayElement = Story.bind({});
ArrayElement.args = {
  path: 'orderDetail[0].text',
  resource: HomerServiceRequest,
};

export const CompositeElement = Story.bind({});
CompositeElement.args = {
  path: "name[0].family&', '&name[0].given[0]",
  resource: HomerSimpson,
};
