import { createReference } from '@medplum/core';
import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ResourceInput } from './ResourceInput';

export default {
  title: 'Medplum/ResourceInput',
  component: ResourceInput,
} as Meta;

export const Practitioners = (): JSX.Element => (
  <Document>
    <ResourceInput name="foo" resourceType="Practitioner" />
  </Document>
);

export const Patients = (): JSX.Element => (
  <Document>
    <ResourceInput name="foo" resourceType="Patient" defaultValue={createReference(HomerSimpson)} />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <ResourceInput disabled name="foo" resourceType="Patient" defaultValue={createReference(HomerSimpson)} />
  </Document>
);
