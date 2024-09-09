import { createReference } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '../test-utils/render';
import { ResourceName, ResourceNameProps } from './ResourceName';

const medplum = new MockClient();

describe('ResourceName', () => {
  function setup(args: ResourceNameProps): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <ResourceName {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders system', () => {
    setup({ value: { reference: 'system' } });
    expect(screen.getByText('System')).toBeDefined();
  });

  test('Renders resource directly', async () => {
    setup({
      value: HomerSimpson,
    });

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Renders resource directly as link', async () => {
    setup({
      value: HomerSimpson,
      link: true,
    });

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Renders after loading the resource', async () => {
    setup({
      value: createReference(HomerSimpson),
    });

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Renders operation outcome', async () => {
    setup({
      value: { reference: 'Patient/not-found' },
    });

    expect(await screen.findByText('[Not found]')).toBeInTheDocument();
  });
});
