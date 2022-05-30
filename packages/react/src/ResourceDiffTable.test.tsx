import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { MedplumProvider } from './MedplumProvider';
import { ResourceDiffTable, ResourceDiffTableProps } from './ResourceDiffTable';

const medplum = new MockClient();

describe('ResourceTable', () => {
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
    expect(removed.parentElement?.className).toEqual('medplum-diff-removed');

    const added = screen.getByText('true');
    expect(added).toBeDefined();
    expect(added.parentElement?.className).toEqual('medplum-diff-added');

    // ID and meta should not be shown
    expect(screen.queryByText('ID')).toBeNull();
    expect(screen.queryByText('Meta')).toBeNull();

    // Birth date did not change, and therefore should not be shown
    expect(screen.queryByText('Birth Date')).toBeNull();
  });
});
