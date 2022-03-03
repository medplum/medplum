import { MockClient } from '@medplum/mock';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { ResourceTable, ResourceTableProps } from './ResourceTable';

const medplum = new MockClient();

describe('ResourceTable', () => {
  function setup(props: ResourceTableProps): void {
    render(
      <MedplumProvider medplum={medplum}>
        <ResourceTable {...props} />
      </MedplumProvider>
    );
  }

  test('Renders empty Practitioner form', async () => {
    setup({
      value: {
        resourceType: 'Practitioner',
      },
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Name'));
    });

    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  test('Renders Practitioner resource', async () => {
    setup({
      value: {
        reference: 'Practitioner/123',
      },
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Name'));
    });

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Gender')).toBeInTheDocument();
  });

  test('Ignore missing values', async () => {
    setup({
      value: {
        reference: 'Practitioner/123',
      },
      ignoreMissingValues: true,
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Name'));
    });

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.queryByText('Gender')).toBeNull();
  });
});
