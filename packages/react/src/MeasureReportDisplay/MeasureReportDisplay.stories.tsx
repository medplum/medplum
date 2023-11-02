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
            id: 'group-1',
            measureScore: {
              value: 67,
              unit: '%',
            },
          },
        ],
      }}
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
            id: 'group-1',
            measureScore: {
              value: 67,
              unit: '%',
            },
          },
          {
            id: 'group-2',
            measureScore: {
              value: 50,
              unit: 'ml',
            },
          },
        ],
      }}
    />
  </Document>
);

export const WithPopulation = (): JSX.Element => (
  <Document>
    <MeasureReportDisplay
      measureReport={{
        resourceType: 'MeasureReport',
        id: 'basic-example',
        group: [
          {
            id: 'group-1',
            population: [
              {
                code: {
                  coding: [
                    {
                      code: 'numerator',
                    },
                  ],
                },
                count: 10,
              },
              {
                code: {
                  coding: [
                    {
                      code: 'denominator',
                    },
                  ],
                },
                count: 100,
              },
            ],
          },
          {
            id: 'group-2',
            measureScore: {
              value: 50,
              unit: 'ml',
            },
          },
        ],
      }}
    />
  </Document>
);
