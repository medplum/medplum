import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { ResourceTable } from '../ResourceTable';

export default {
  title: 'Medplum/ResourceTable',
  component: ResourceTable,
} as Meta;

export const Patient = () => (
  <Document>
    <ResourceTable resourceType="Patient" id={process.env.SAMPLE_PATIENT_ID} />
  </Document>
);

export const User = () => (
  <Document>
    <ResourceTable resourceType="User" id={process.env.SAMPLE_USER_ID} />
  </Document>
);
