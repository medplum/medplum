import { FhirPathDisplay, FhirPathDisplayProps } from './FhirPathDisplay';
import { PropertyType } from '@medplum/core';
import { HomerServiceRequest, HomerSimpson } from '@medplum/mock';
import { ComponentStory, Meta } from '@storybook/react';

export default {
  component: FhirPathDisplay,
  title: 'Medplum/FhirPathDisplay',
} as Meta;

const Story: ComponentStory<typeof FhirPathDisplay> = (args: FhirPathDisplayProps) => <FhirPathDisplay {...args} />;

export const Id = Story.bind({});
Id.args = {
  path: 'id',
  resource: HomerServiceRequest,
  propertyType: PropertyType.string,
};

export const ArrayElement = Story.bind({});
ArrayElement.args = {
  path: 'orderDetail[0].text',
  resource: HomerServiceRequest,
  propertyType: PropertyType.string,
};

export const CompositeElement = Story.bind({});
CompositeElement.args = {
  path: "name[0].family&', '&name[0].given[0]",
  resource: HomerSimpson,
  propertyType: PropertyType.string,
};
