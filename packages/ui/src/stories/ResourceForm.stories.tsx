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

export const DiagnosticReportIssues = () => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'DiagnosticReport'
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
      outcome={{
        resourceType: 'OperationOutcome',
        id: 'dabf3927-a936-427e-9320-2ff98b8bea46',
        issue: [
          {
            severity: 'error',
            code: 'structure',
            details: {
              text: 'Missing required property "code"'
            },
            expression: ['code']
          }
        ]
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

export const ValueSet = () => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'ValueSet'
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const DeviceRequest = () => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'DeviceRequest'
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Specimen = () => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'Specimen'
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);
