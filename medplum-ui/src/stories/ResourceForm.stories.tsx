import { Meta } from '@storybook/react';
import React from 'react';
import { ResourceForm, ResourceFormProps } from '../ResourceForm';
import { Document } from '../Document';

export default {
  title: 'Medplum/ResourceForm',
  component: ResourceForm,
} as Meta;

export const Basic = (args: ResourceFormProps) => (
  <Document>
    <ResourceForm resourceType="Patient" id="24c3243a-f2ba-459a-846c-0c5f36c725e3" />
  </Document>
);
