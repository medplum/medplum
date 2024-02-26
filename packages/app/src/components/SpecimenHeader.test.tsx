import { Specimen } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '../test-utils/render';
import { SpecimenHeader } from './SpecimenHeader';

const medplum = new MockClient();

describe('SpecimenHeader', () => {
  function setup(specimen: Specimen): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <SpecimenHeader specimen={specimen} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders no collection', async () => {
    setup({
      resourceType: 'Specimen',
    });

    expect(screen.getByText('Specimen')).toBeInTheDocument();
  });

  test('Renders collection no collectedDateTime', async () => {
    setup({
      resourceType: 'Specimen',
      collection: {},
    });

    expect(screen.getByText('Specimen')).toBeInTheDocument();
  });

  test('Renders collection and collectedDateTime', async () => {
    const birthDate = new Date();
    birthDate.setUTCHours(0, 0, 0, 0);
    birthDate.setUTCDate(birthDate.getUTCDate() - 5);

    setup({
      resourceType: 'Specimen',
      collection: {
        collectedDateTime: birthDate.toISOString(),
      },
    });

    expect(screen.getByText('Specimen Age')).toBeInTheDocument();
    expect(screen.queryByText('Specimen Stability')).toBeNull();
    expect(screen.getByText('005D')).toBeInTheDocument();
  });

  test('Renders specimen  stability ', async () => {
    const birthDate = new Date();
    birthDate.setUTCHours(0, 0, 0, 0);
    birthDate.setUTCDate(birthDate.getUTCDate() - 5);

    const receivedTime = new Date(birthDate);
    receivedTime.setUTCDate(receivedTime.getUTCDate() + 2);

    setup({
      resourceType: 'Specimen',
      collection: {
        collectedDateTime: birthDate.toISOString(),
      },
      receivedTime: receivedTime.toISOString(),
    });

    expect(screen.getByText('Specimen Age')).toBeInTheDocument();
    expect(screen.getByText('005D')).toBeInTheDocument();
    expect(screen.getByText('002D')).toBeInTheDocument();
  });
});
