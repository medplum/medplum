import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { ResourceInput } from '../ResourceInput';

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
    <ResourceInput name="foo" resourceType="Patient" />
  </Document>
);
