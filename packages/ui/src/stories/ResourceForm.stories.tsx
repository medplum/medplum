import { DrAliceSmith, HomerSimpson, TestOrganization } from '@medplum/mock';
import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { ResourceForm } from '../ResourceForm';

export default {
  title: 'Medplum/ResourceForm',
  component: ResourceForm,
} as Meta;

export const Patient = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={HomerSimpson}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Organization = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={TestOrganization}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Practitioner = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={DrAliceSmith}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const DiagnosticReport = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'DiagnosticReport',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const DiagnosticReportIssues = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'DiagnosticReport',
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
              text: 'Missing required property "code"',
            },
            expression: ['code'],
          },
        ],
      }}
    />
  </Document>
);

export const Observation = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'Observation',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Questionnaire = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'Questionnaire',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Subscription = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'Subscription',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const ValueSet = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'ValueSet',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const DeviceRequest = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'DeviceRequest',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Specimen = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'Specimen',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Media = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'Media',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);
