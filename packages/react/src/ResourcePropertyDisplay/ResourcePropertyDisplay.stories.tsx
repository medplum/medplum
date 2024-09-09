import { PropertyType } from '@medplum/core';
import { Attachment } from '@medplum/fhirtypes';
import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

export default {
  title: 'Medplum/ResourcePropertyDisplay',
  component: ResourcePropertyDisplay,
} as Meta;

export const Name = (): JSX.Element => (
  <Document>
    <ResourcePropertyDisplay
      value={HomerSimpson.name}
      property={{
        path: 'Patient.name',
        description: '',
        min: 0,
        max: Infinity,
        isArray: true,
        type: [{ code: 'HumanName' }],
      }}
      propertyType={PropertyType.HumanName}
    />
  </Document>
);

export const Address = (): JSX.Element => (
  <Document>
    <ResourcePropertyDisplay
      value={HomerSimpson.address}
      property={{
        path: 'Patient.address',
        description: '',
        min: 0,
        max: Infinity,
        isArray: true,
        type: [{ code: 'Address' }],
      }}
      propertyType={PropertyType.Address}
    />
  </Document>
);

export const AttachmentProperty = (): JSX.Element => (
  <Document>
    <ResourcePropertyDisplay
      value={[
        {
          url: 'http://example.com/foo.txt',
        } as Attachment,
      ]}
      property={{
        path: 'Patient.photo',
        description: '',
        min: 0,
        max: Infinity,
        isArray: true,
        type: [{ code: 'Attachment' }],
      }}
      propertyType={PropertyType.Attachment}
    />
  </Document>
);
