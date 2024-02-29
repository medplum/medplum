import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '../test-utils/render';
import { BackboneElementDisplay, BackboneElementDisplayProps } from './BackboneElementDisplay';

const medplum = new MockClient();

describe('BackboneElementDisplay', () => {
  async function setup(args: BackboneElementDisplayProps): Promise<void> {
    await act(async () =>
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <BackboneElementDisplay {...args} />
          </MedplumProvider>
        </MemoryRouter>
      )
    );
  }

  test('Renders null', async () => {
    await setup({
      path: 'Patient.contact',
      value: { type: 'PatientContact', value: null },
    });
  });

  test('Renders value', async () => {
    await setup({
      path: 'Patient.contact',
      value: {
        type: 'PatientContact',
        value: {
          id: '123',
          name: {
            given: ['John'],
            family: 'Doe',
          },
        },
      },
    });
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  test('Ignore missing properties', async () => {
    await setup({
      path: 'Patient.contact',
      value: {
        type: 'PatientContact',
        value: {
          id: '123',
        },
      },
      ignoreMissingValues: true,
    });
    expect(screen.queryByText('Name')).not.toBeInTheDocument();
  });

  test('Renders simple name', async () => {
    await setup({
      path: 'Patient.contact',
      value: {
        type: 'PatientContact',
        value: {
          name: 'Simple Name',
        },
      },
    });
    expect(screen.getByText('Simple Name')).toBeInTheDocument();
  });

  test('Handles name object value', async () => {
    await setup({
      path: 'Organization.contact',
      value: {
        type: 'OrganizationContact',
        value: {
          name: {
            given: ['John'],
            family: 'Doe',
          },
        },
      },
    });
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  test('Not implemented', async () => {
    await setup({
      path: 'Foo',
      value: {
        type: 'Foo',
        value: {
          foo: 'bar',
        },
      },
    });
    expect(screen.getByText('Foo not implemented')).toBeInTheDocument();
  });
});
