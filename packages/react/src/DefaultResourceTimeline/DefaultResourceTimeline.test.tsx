import { createReference } from '@medplum/core';
import { DiagnosticReport, Patient } from '@medplum/fhirtypes';
import { ExampleSubscription, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen, waitFor } from '../test-utils/render';
import { MemoryRouter } from 'react-router-dom';
import { DefaultResourceTimeline, DefaultResourceTimelineProps } from './DefaultResourceTimeline';

const medplum = new MockClient();

describe('DefaultResourceTimeline', () => {
  async function setup(args: DefaultResourceTimelineProps): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <DefaultResourceTimeline {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Renders reference', async () => {
    await setup({ resource: createReference(ExampleSubscription) });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Renders resource', async () => {
    await setup({ resource: ExampleSubscription });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Sorting', async () => {
    // Sorting has a lot of hidden complexity.
    // For the "primary resource" of a timeline, we always sort by "lastUpdated" descending.
    // For other resources, we use a variety of special cases to represent the "natural" order.
    // Other examples of special cases:
    //  - DiagnosticReport.issued
    //  - Media.issued
    //  - Observation.issued
    //  - DocumentReference.date
    // See "sortByDateAndPriority()" for more details.

    const p = await medplum.createResource<Patient>({ resourceType: 'Patient' });

    const dr1 = await medplum.createResource<DiagnosticReport>({
      resourceType: 'DiagnosticReport',
      meta: {
        lastUpdated: '2021-01-01T00:00:00Z',
      },
      subject: createReference(p),
      code: { text: 'test' },
      issued: '2021-01-01T00:00:00Z',
      status: 'preliminary',
    });

    // Take advantage of the fact that MockClient.createResource allows you to set the meta.lastUpdated value.
    const dr2 = await medplum.createResource<DiagnosticReport>({
      ...dr1,
      meta: {
        lastUpdated: '2021-01-02T00:00:00Z',
      },
      status: 'final',
    });

    await setup({ resource: dr2 });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(items.length).toBe(2);

    // Most recent "final" should be on top
    expect(items[0].textContent).toContain('final');

    // Created item should be on the bototm
    expect(items[1].textContent).toContain('Created');
    expect(items[1].textContent).toContain('preliminary');
    expect(items[1].textContent).not.toContain('final');
  });
});
