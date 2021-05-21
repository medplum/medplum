import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { ResourceForm } from '../ResourceForm';

export default {
  title: 'Medplum/ResourceForm',
  component: ResourceForm,
} as Meta;

export const Patient = () => (
  <Document>
    <ResourceForm
      resourceType="Patient"
      id="24c3243a-f2ba-459a-846c-0c5f36c725e3"
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Organization = () => (
  <Document>
    <ResourceForm
      resourceType="Organization"
      id="01764374-df38-34a1-7c93-3066982cd231"
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

//Organization/01764374-df38-34a1-7c93-3066982cd231