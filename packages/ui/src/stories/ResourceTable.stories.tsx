import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { ResourceTable } from '../ResourceTable';

export default {
  title: 'Medplum/ResourceTable',
  component: ResourceTable,
} as Meta;

export const Basic = () => (
  <Document>
    <ResourceTable resourceType="Patient" id={process.env.SAMPLE_PATIENT_ID} />
  </Document>
);
