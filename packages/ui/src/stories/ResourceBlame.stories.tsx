import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { ResourceBlame } from '../ResourceBlame';

export default {
  title: 'Medplum/ResourceBlame',
  component: ResourceBlame,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ResourceBlame resourceType="Patient" id={process.env.SAMPLE_PATIENT_ID} />
  </Document>
);
