import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen, waitFor } from '../test-utils/render';
import { ResourceDiffTable, ResourceDiffTableProps } from './ResourceDiffTable';

const medplum = new MockClient();

describe('ResourceDiffTable', () => {
  function setup(props: ResourceDiffTableProps): void {
    render(
      <MedplumProvider medplum={medplum}>
        <ResourceDiffTable {...props} />
      </MedplumProvider>
    );
  }

  test('Renders', async () => {
    const original: Patient = {
      resourceType: 'Patient',
      id: '123',
      meta: {
        versionId: '456',
      },
      birthDate: '1990-01-01',
      active: false,
    };

    const revised: Patient = {
      resourceType: 'Patient',
      id: '123',
      meta: {
        versionId: '457',
      },
      birthDate: '1990-01-01',
      active: true,
    };

    await act(async () => {
      setup({ original, revised });
    });

    await waitFor(() => screen.getByText('Replace active'));

    const removed = screen.getByText('false');
    expect(removed).toBeDefined();
    expect(removed).toHaveClass('removed');

    const added = screen.getByText('true');
    expect(added).toBeDefined();
    expect(added).toHaveClass('added');

    // ID and meta should not be shown
    expect(screen.queryByText('ID')).toBeNull();
    expect(screen.queryByText('Meta')).toBeNull();

    // Birth date did not change, and therefore should not be shown
    expect(screen.queryByText('Birth Date')).toBeNull();
  });
});
