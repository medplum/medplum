import { createReference } from '@medplum/core';
import { ActivityDefinition, ObservationDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '../test-utils/render';
import { PanelsPage } from './PanelsPage';

const medplum = new MockClient();

async function setup(): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <PanelsPage />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('PanelsPage', () => {
  beforeAll(async () => {
    const assay1 = await medplum.createResource({
      resourceType: 'ObservationDefinition',
      id: '1',
      code: { coding: [{ display: 'Assay 1' }] },
    } as ObservationDefinition);

    const assay2 = await medplum.createResource({
      resourceType: 'ObservationDefinition',
      id: '2',
      code: { coding: [{ display: 'Assay 2' }] },
    } as ObservationDefinition);

    await medplum.createResource({
      resourceType: 'ActivityDefinition',
      id: '1',
      name: 'Panel 1',
      observationResultRequirement: [createReference(assay1), createReference(assay2)],
    } as ActivityDefinition);

    await medplum.createResource({
      resourceType: 'ActivityDefinition',
      id: '2',
      name: 'Panel 2',
      observationResultRequirement: [createReference(assay1)],
    } as ActivityDefinition);

    expect(await medplum.searchResources('ActivityDefinition', '_count=100')).toHaveLength(2);
    expect(await medplum.searchResources('ObservationDefinition', '_count=100')).toHaveLength(2);
  });

  test('Renders', async () => {
    await setup();
    expect(screen.getByText('Panel 1')).toBeInTheDocument();
    expect(screen.getByText('Panel 2')).toBeInTheDocument();
    expect(screen.getByText('Assay 1')).toBeInTheDocument();
    expect(screen.getByText('Assay 2')).toBeInTheDocument();
    expect(screen.getAllByText('✅')).toHaveLength(3);
  });
});
