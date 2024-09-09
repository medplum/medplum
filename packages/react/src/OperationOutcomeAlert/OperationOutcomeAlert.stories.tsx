import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { OperationOutcomeAlert } from './OperationOutcomeAlert';

export default {
  title: 'Medplum/OperationOutcomeAlert',
  component: OperationOutcomeAlert,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <OperationOutcomeAlert
      outcome={{
        resourceType: 'OperationOutcome',
        id: 'not-found',
        issue: [
          {
            severity: 'error',
            code: 'not-found',
            details: { text: 'Not found' },
          },
        ],
      }}
    />
  </Document>
);

export const Issues = (): JSX.Element => (
  <Document>
    <OperationOutcomeAlert
      issues={[
        {
          severity: 'error',
          code: 'not-found',
          details: { text: 'Not found' },
        },
        {
          severity: 'warning',
          code: 'too-costly',
          details: { text: 'Too Costly' },
        },
      ]}
    />
  </Document>
);
