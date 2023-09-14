import { PropertyType } from '@medplum/core';
import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { ResourcePropertyInput } from './ResourcePropertyInput';

export default {
  title: 'Medplum/ResourcePropertyInput',
  component: ResourcePropertyInput,
} as Meta;

export const AddressInput = (): JSX.Element => (
  <Document>
    <ResourcePropertyInput
      name="address-input"
      defaultValue={HomerSimpson.address?.[0]}
      property={{ type: [{ code: 'Address' }] }}
      defaultPropertyType={PropertyType.Address}
      onChange={console.log}
    />
  </Document>
);

export const BooleanInput = (): JSX.Element => (
  <Document>
    <ResourcePropertyInput
      name="boolean-input"
      defaultValue={false}
      property={{ type: [{ code: 'boolean' }] }}
      defaultPropertyType={PropertyType.boolean}
      onChange={console.log}
    />
  </Document>
);

export const DateInput = (): JSX.Element => (
  <Document>
    <ResourcePropertyInput
      name="date-input"
      defaultValue={'2021-01-01'}
      property={{ type: [{ code: 'date' }] }}
      defaultPropertyType={PropertyType.date}
      onChange={console.log}
    />
  </Document>
);

export const DateTimeInput = (): JSX.Element => (
  <Document>
    <ResourcePropertyInput
      name="date-input"
      defaultValue={'2021-01-01T16:00:01Z'}
      property={{ type: [{ code: 'dateTime' }] }}
      defaultPropertyType={PropertyType.dateTime}
      onChange={console.log}
    />
  </Document>
);
