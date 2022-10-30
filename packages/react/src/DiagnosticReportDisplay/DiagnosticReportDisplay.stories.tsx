import { HomerDiagnosticReport } from '@medplum/mock';
import { Meta } from '@storybook/react';
import React from 'react';
import { DiagnosticReportDisplay } from './DiagnosticReportDisplay';
import { Document } from '../Document/Document';

export default {
  title: 'Medplum/DiagnosticReportDisplay',
  component: DiagnosticReportDisplay,
} as Meta;

export const Simple = (): JSX.Element => (
  <Document>
    <DiagnosticReportDisplay value={HomerDiagnosticReport} />
  </Document>
);
