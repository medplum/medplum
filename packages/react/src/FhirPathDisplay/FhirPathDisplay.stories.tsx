import { PropertyType } from '@medplum/core';
import { HomerServiceRequest, HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { FhirPathDisplay } from './FhirPathDisplay';

export default {
  component: FhirPathDisplay,
  title: 'Medplum/FhirPathDisplay',
} as Meta;

export const Id = (): JSX.Element => (
  <FhirPathDisplay path="id" resource={HomerServiceRequest} propertyType={PropertyType.string} />
);

export const ArrayElement = (): JSX.Element => (
  <FhirPathDisplay path="orderDetail[0].text" resource={HomerServiceRequest} propertyType={PropertyType.string} />
);

export const CompositeElement = (): JSX.Element => (
  <FhirPathDisplay
    path="name[0].family&', '&name[0].given[0]"
    resource={HomerSimpson}
    propertyType={PropertyType.string}
  />
);
