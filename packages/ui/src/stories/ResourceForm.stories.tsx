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
      defaultValue={{
        reference: `Patient/${process.env.SAMPLE_PATIENT_ID}`
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Organization = () => (
  <Document>
    <ResourceForm
      defaultValue={{
        reference: `Organization/${process.env.SAMPLE_ORGANIZATION_ID}`
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Practitioner = () => (
  <Document>
    <ResourceForm
      defaultValue={{
        reference: `Practitioner/${process.env.SAMPLE_PRACTITIONER_ID}`
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const DiagnosticReport = () => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'DiagnosticReport'
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Observation = () => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'Observation'
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Questionnaire = () => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'Questionnaire'
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Subscription = () => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'Subscription'
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);
