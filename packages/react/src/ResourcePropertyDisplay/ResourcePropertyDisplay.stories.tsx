import { PropertyType } from '@medplum/core';
import { Attachment } from '@medplum/fhirtypes';
import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

export default {
  title: 'Medplum/ResourcePropertyDisplay',
  component: ResourcePropertyDisplay,
} as Meta;

export const Name = (): JSX.Element => (
  <Document>
    <ResourcePropertyDisplay
      value={HomerSimpson.name?.[0]}
      property={{ type: [{ code: 'Name' }] }}
      propertyType={PropertyType.HumanName}
    />
  </Document>
);

export const Address = (): JSX.Element => (
  <Document>
    <ResourcePropertyDisplay
      value={HomerSimpson.address?.[0]}
      property={{ type: [{ code: 'Address' }] }}
      propertyType={PropertyType.Address}
    />
  </Document>
);

export const AttachmentProperty = (): JSX.Element => (
  <Document>
    <ResourcePropertyDisplay
      value={
        {
          url: 'http://example.com/foo.txt',
        } as Attachment
      }
      property={{ type: [{ code: 'Attachement' }] }}
      propertyType={PropertyType.Attachment}
    />
  </Document>
);
