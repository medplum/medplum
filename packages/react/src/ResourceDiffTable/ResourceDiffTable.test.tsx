import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from '@medplum/react-hooks';
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

    await waitFor(() => screen.getByText('Property'));

    const removed = screen.getByText('false');
    expect(removed).toBeDefined();
    expect(removed).toHaveStyle('color: rgb(240, 62, 62);');

    const added = screen.getByText('true');
    expect(added).toBeDefined();
    expect(added).toHaveStyle('color: rgb(55, 178, 77);');

    // ID and meta should not be shown
    expect(screen.queryByText('ID')).toBeNull();
    expect(screen.queryByText('Meta')).toBeNull();

    // Birth date did not change, and therefore should not be shown
    expect(screen.queryByText('Birth Date')).toBeNull();
  });
});
