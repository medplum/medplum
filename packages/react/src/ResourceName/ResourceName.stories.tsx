import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { ResourceName } from './ResourceName';

export default {
  title: 'Medplum/ResourceName',
  component: ResourceName,
} as Meta;

export const Resource = (): JSX.Element => (
  <Document>
    <ResourceName value={HomerSimpson} />
  </Document>
);

export const Reference = (): JSX.Element => (
  <Document>
    <ResourceName value={{ reference: 'Patient/123' }} />
  </Document>
);

export const Error = (): JSX.Element => (
  <Document>
    <ResourceName value={{ reference: 'Patient/xyz' }} />
  </Document>
);
