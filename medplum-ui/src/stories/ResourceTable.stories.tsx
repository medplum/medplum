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
    <ResourceTable resourceType="Patient" id="24c3243a-f2ba-459a-846c-0c5f36c725e3" />
  </Document>
);
