import { InternalSchemaElement, PropertyType } from '@medplum/core';
import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ResourcePropertyInput } from './ResourcePropertyInput';
import { Extension } from '@medplum/fhirtypes';
import { useCallback } from 'react';

export default {
  title: 'Medplum/ResourcePropertyInput',
  component: ResourcePropertyInput,
} as Meta;

export const AddressInput = (): JSX.Element => (
  <Document>
    <ResourcePropertyInput
      name="address-input"
      path="Patient.address"
      defaultValue={HomerSimpson.address?.[0]}
      property={{ path: '', description: '', min: 0, max: 1, type: [{ code: 'Address' }] }}
      defaultPropertyType={PropertyType.Address}
      onChange={console.log}
      outcome={undefined}
    />
  </Document>
);

export const BooleanInput = (): JSX.Element => (
  <Document>
    <ResourcePropertyInput
      name="boolean-input"
      path="Device.boolean"
      defaultValue={false}
      property={{ path: '', description: '', min: 0, max: 1, type: [{ code: 'boolean' }] }}
      defaultPropertyType={PropertyType.boolean}
      onChange={console.log}
      outcome={undefined}
    />
  </Document>
);

export const DateInput = (): JSX.Element => (
  <Document>
    <ResourcePropertyInput
      name="date-input"
      path="Observation.date"
      defaultValue="2021-01-01"
      property={{ path: '', description: '', min: 0, max: 1, type: [{ code: 'date' }] }}
      defaultPropertyType={PropertyType.date}
      onChange={console.log}
      outcome={undefined}
    />
  </Document>
);

export const DateTimeInput = (): JSX.Element => (
  <Document>
    <ResourcePropertyInput
      name="date-input"
      path="Procedure.dateTime"
      defaultValue="2021-01-01T16:00:01Z"
      property={{ path: '', description: '', min: 0, max: 1, type: [{ code: 'dateTime' }] }}
      defaultPropertyType={PropertyType.dateTime}
      onChange={console.log}
      outcome={undefined}
    />
  </Document>
);

const defaultValue: Extension[] = [
  {
    url: 'https://example.com',
    valueString: 'foo',
  },
];
const property: InternalSchemaElement = {
  path: 'extension',
  description: '',
  min: 0,
  max: 10,
  type: [{ code: 'Extension' }],
  isArray: false,
};
export const ExtensionInput = (): JSX.Element => {
  const onChange = useCallback((newValue: any): void => {
    console.log('onChange', newValue);
  }, []);

  return (
    <Document>
      <ResourcePropertyInput
        name="extension"
        path="Patient.extension"
        defaultValue={defaultValue}
        property={property}
        defaultPropertyType={PropertyType.dateTime}
        onChange={onChange}
        outcome={undefined}
      />
    </Document>
  );
};
