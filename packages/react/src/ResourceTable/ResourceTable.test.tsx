import { MockClient } from '@medplum/mock';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MedplumProvider } from '@medplum/react-hooks';
import { ResourceTable, ResourceTableProps } from './ResourceTable';

const medplum = new MockClient();

describe('ResourceTable', () => {
  async function setup(props: ResourceTableProps): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <ResourceTable {...props} />
        </MedplumProvider>
      );
    });
  }

  test('Renders empty Practitioner form', async () => {
    await setup({
      value: {
        resourceType: 'Practitioner',
      },
    });

    await waitFor(() => screen.getByText('Name'));

    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  test('Renders Practitioner resource', async () => {
    await setup({
      value: {
        reference: 'Practitioner/123',
      },
    });

    await waitFor(() => screen.getByText('Name'));

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Gender')).toBeInTheDocument();
  });

  test('Ignore missing values', async () => {
    await setup({
      value: {
        reference: 'Practitioner/123',
      },
      ignoreMissingValues: true,
    });

    await waitFor(() => screen.getByText('Name'));

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.queryByText('Gender')).toBeNull();
  });
});
