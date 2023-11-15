import { ObservationDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen } from '../test-utils/render';
import { MemoryRouter } from 'react-router-dom';
import { AssaysPage } from './AssaysPage';

const medplum = new MockClient();

async function setup(): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <AssaysPage />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('AssaysPage', () => {
  test('Renders', async () => {
    await medplum.createResource({
      resourceType: 'ObservationDefinition',
      id: '1',
      code: { coding: [{ display: 'Assay 1' }] },
      quantitativeDetails: {
        unit: { text: 'mg/dL' },
        decimalPrecision: 2,
      },
    } as ObservationDefinition);

    await setup();
    expect(screen.getByText('Assay 1')).toBeInTheDocument();
  });

  test('Reference range', async () => {
    await medplum.createResource({
      resourceType: 'ObservationDefinition',
      id: '1',
      code: { coding: [{ display: 'Assay 1' }] },
      qualifiedInterval: [{ range: { low: { value: 0, unit: 'mg/dL' }, high: { value: 100, unit: 'mg/dL' } } }],
    } as ObservationDefinition);

    await setup();
    expect(screen.getByText('Assay 1')).toBeInTheDocument();
    expect(screen.getByText('0 - 100 mg/dL')).toBeInTheDocument();
  });

  test('Qualified range', async () => {
    await medplum.createResource({
      resourceType: 'ObservationDefinition',
      id: '1',
      code: { coding: [{ display: 'Assay 1' }] },
      qualifiedInterval: [
        {
          gender: 'female',
          age: { high: { value: 30, unit: 'year' } },
          range: { low: { value: 0, unit: 'mg/dL' }, high: { value: 100, unit: 'mg/dL' } },
        },
        {
          gender: 'female',
          age: { low: { value: 31, unit: 'year' } },
          range: { low: { value: 0, unit: 'mg/dL' }, high: { value: 100, unit: 'mg/dL' } },
        },
        {
          gender: 'male',
          age: { high: { value: 30, unit: 'year' } },
          range: { low: { value: 0, unit: 'mg/dL' }, high: { value: 100, unit: 'mg/dL' } },
        },
        {
          gender: 'male',
          age: { low: { value: 31, unit: 'year' } },
          range: { low: { value: 0, unit: 'mg/dL' }, high: { value: 100, unit: 'mg/dL' } },
        },
      ],
    } as ObservationDefinition);

    await setup();
    expect(screen.getByText('Assay 1')).toBeInTheDocument();
    expect(screen.getByText('Female')).toBeInTheDocument();
    expect(screen.getByText('Male')).toBeInTheDocument();
  });
});
