import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '../test-utils/render';
import { MeasureReportDisplay, MeasureReportDisplayProps } from './MeasureReportDisplay';

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
  beforeAll(async () => {
    await medplum.createResource({
      resourceType: 'Measure',
      id: 'measure-1',
      title: 'Test Measure',
      subtitle: 'Test Subtitle',
      url: 'http://example.com',
      status: 'active',
    });
  });

  test('MeasureReport with 1 group', async () => {
    await setup({
      measureReport: {
        resourceType: 'MeasureReport',
        measure: 'http://example.com',
        status: 'complete',
        type: 'individual',
        period: { start: '2021-01-01', end: '2021-12-31' },
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
        measure: 'http://example.com',
        status: 'complete',
        type: 'individual',
        period: { start: '2021-01-01', end: '2021-12-31' },
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

  test('Render Measure Title', async () => {
    await setup({
      measureReport: {
        resourceType: 'MeasureReport',
        measure: 'http://example.com',
        status: 'complete',
        type: 'individual',
        period: { start: '2021-01-01', end: '2021-12-31' },
        group: [
          {
            id: 'group-1',
            measureScore: {
              value: 75,
              unit: '%',
            },
          },
        ],
      },
    });

    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Test Measure')).toBeInTheDocument();
    expect(screen.getByText('Test Subtitle')).toBeInTheDocument();
  });

  test('MeasureReport With Population', async () => {
    await setup({
      measureReport: {
        resourceType: 'MeasureReport',
        id: 'basic-example',
        measure: 'http://example.com',
        status: 'complete',
        type: 'individual',
        period: { start: '2021-01-01', end: '2021-12-31' },
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

  test('MeasureReport With Insufficient Population Data', async () => {
    await setup({
      measureReport: {
        resourceType: 'MeasureReport',
        id: 'insufficient-example',
        measure: 'http://example.com',
        status: 'complete',
        type: 'individual',
        period: { start: '2021-01-01', end: '2021-12-31' },
        group: [
          {
            id: 'group-1',
            population: [
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

    expect(screen.getByText('Insufficient Data')).toBeInTheDocument();
  });

  test('MeasureReport With 0 in denominator', async () => {
    await setup({
      measureReport: {
        resourceType: 'MeasureReport',
        id: 'insufficient-example',
        measure: 'http://example.com',
        status: 'complete',
        type: 'individual',
        period: { start: '2021-01-01', end: '2021-12-31' },
        group: [
          {
            id: 'group-1',
            population: [
              {
                code: {
                  coding: [
                    {
                      code: 'denominator',
                    },
                  ],
                },
                count: 0,
              },
            ],
          },
        ],
      },
    });

    expect(screen.getByText('Not Applicable')).toBeInTheDocument();
    expect(screen.getByText('Denominator: 0')).toBeInTheDocument();
  });
});
