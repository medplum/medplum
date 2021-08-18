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
      id={process.env.SAMPLE_PATIENT_ID}
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
      id={process.env.SAMPLE_ORGANIZATION_ID}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Practitioner = () => (
  <Document>
    <ResourceForm
      resourceType="Practitioner"
      id={process.env.SAMPLE_PRACTITIONER_ID}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const User = () => (
  <Document>
    <ResourceForm
      resourceType="User"
      id={process.env.SAMPLE_USER_ID}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Questionnaire = () => (
  <Document>
    <ResourceForm
      resource={{
        resourceType: 'Questionnaire'
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);
