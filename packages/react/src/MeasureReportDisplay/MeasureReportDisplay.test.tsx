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
  test('Display MeasureReport', async () => {
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

  test('Display MeasureReport Multiple Groups', async () => {
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
});
