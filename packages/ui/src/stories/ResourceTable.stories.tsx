import { HomerObservation1, HomerSimpson } from '@medplum/mock';
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
    <ResourceTable value={HomerSimpson} />
  </Document>
);

export const Observation = (): JSX.Element => (
  <Document>
    <ResourceTable value={HomerObservation1} />
  </Document>
);

export const ObservationIgnoreEmpty = (): JSX.Element => (
  <Document>
    <ResourceTable value={HomerObservation1} ignoreMissingValues={true} />
  </Document>
);
