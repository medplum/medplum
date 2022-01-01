import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { ResourceTable } from '../ResourceTable';

export default {
  title: 'Medplum/ResourceTable',
  component: ResourceTable,
} as Meta;

export const Patient = (): JSX.Element => (
  <Document>
    <ResourceTable value={{ reference: `Patient/${process.env.SAMPLE_PATIENT_ID}` }} />
  </Document>
);

export const Observation = (): JSX.Element => (
  <Document>
    <ResourceTable value={{ reference: `Observation/${process.env.SAMPLE_OBSERVATION_ID}` }} />
  </Document>
);

export const ObservationIgnoreEmpty = (): JSX.Element => (
  <Document>
    <ResourceTable
      value={{ reference: `Observation/${process.env.SAMPLE_OBSERVATION_ID}` }}
      ignoreMissingValues={true}
    />
  </Document>
);
