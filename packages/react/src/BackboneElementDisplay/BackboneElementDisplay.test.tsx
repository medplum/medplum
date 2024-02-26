import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '../test-utils/render';
import { BackboneElementDisplay, BackboneElementDisplayProps } from './BackboneElementDisplay';

const medplum = new MockClient();

describe('BackboneElementDisplay', () => {
  function setup(args: BackboneElementDisplayProps): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <BackboneElementDisplay {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders null', () => {
    setup({
      value: { type: 'PatientContact', value: null },
    });
  });

  test('Renders value', () => {
    setup({
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

  test('Ignore missing properties', () => {
    setup({
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

  test('Renders simple name', () => {
    setup({
      value: {
        type: 'PatientContact',
        value: {
          name: 'Simple Name',
        },
      },
    });
    expect(screen.getByText('Simple Name')).toBeInTheDocument();
  });

  test('Handles name object value', () => {
    setup({
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

  test('Not implemented', () => {
    setup({
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
