import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen } from '../test-utils/render';
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

    expect(await screen.findByText('Name')).toBeInTheDocument();

    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  test('Renders Practitioner resource', async () => {
    await setup({
      value: {
        reference: 'Practitioner/123',
      },
    });

    expect(await screen.findByText('Name')).toBeInTheDocument();

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

    expect(await screen.findByText('Name')).toBeInTheDocument();

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.queryByText('Gender')).toBeNull();
  });
});
