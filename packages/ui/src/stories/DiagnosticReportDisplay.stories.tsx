import { Meta } from '@storybook/react';
import React from 'react';
import { DiagnosticReportDisplay } from '../DiagnosticReportDisplay';
import { Document } from '../Document';

export default {
  title: 'Medplum/DiagnosticReportDisplay',
  component: DiagnosticReportDisplay,
} as Meta;

export const Simple = (): JSX.Element => (
  <Document>
    <DiagnosticReportDisplay
      value={{
        reference: `DiagnosticReport/${process.env.SAMPLE_DIAGNOSTIC_REPORT_ID}`,
      }}
    />
  </Document>
);
