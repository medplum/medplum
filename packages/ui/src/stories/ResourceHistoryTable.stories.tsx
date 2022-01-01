import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { ResourceHistoryTable } from '../ResourceHistoryTable';

export default {
  title: 'Medplum/ResourceHistoryTable',
  component: ResourceHistoryTable,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ResourceHistoryTable resourceType="Patient" id={process.env.SAMPLE_PATIENT_ID} />
  </Document>
);
