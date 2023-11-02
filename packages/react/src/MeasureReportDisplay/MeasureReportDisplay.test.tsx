import { MockClient } from '@medplum/mock';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MeasureReportDisplay, MeasureReportDisplayProps } from './MeasureReportDisplay';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '@medplum/react-hooks';

const medplum = new MockClient();

async function setup(args: MeasureReportDisplayProps): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MeasureReportDisplay {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('MeasureReportDisplay', () => {
  test('MeasureReport with 1 group', async () => {
    await setup({
      measureReport: {
        resourceType: 'MeasureReport',
        group: [
          {
            id: 'group-1',
            measureScore: {
              value: 67,
              unit: '%',
            },
          },
        ],
      },
    });

    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  test('MeasureReport Multiple Groups', async () => {
    await setup({
      measureReport: {
        resourceType: 'MeasureReport',
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
              value: 24,
              unit: 'ml',
            },
          },
        ],
      },
    });

    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('24 ml')).toBeInTheDocument();
  });

  test('MeasureReport With Population', async () => {
    await setup({
      measureReport: {
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
      },
    });

    expect(screen.getByText('10 / 100')).toBeInTheDocument();
    expect(screen.getByText('50 ml')).toBeInTheDocument();
  });
});
