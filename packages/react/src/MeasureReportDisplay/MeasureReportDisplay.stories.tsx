import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { MeasureReportDisplay } from './MeasureReportDisplay';

export default {
  title: 'Medplum/MeasureReportDisplay',
  component: MeasureReportDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <MeasureReportDisplay
      measureReport={{
        resourceType: 'MeasureReport',
        id: 'basic-example',
        group: [
          {
            measureScore: {
              value: 67,
              unit: '%',
            },
          },
        ],
      }}
      title="Basic Example"
    />
  </Document>
);

export const Multiple = (): JSX.Element => (
  <Document>
    <MeasureReportDisplay
      measureReport={{
        resourceType: 'MeasureReport',
        id: 'basic-example',
        group: [
          {
            measureScore: {
              value: 67,
              unit: '%',
            },
          },
          {
            measureScore: {
              value: 50,
              unit: 'ml',
            },
          },
        ],
      }}
      title="Basic Example"
    />
  </Document>
);
