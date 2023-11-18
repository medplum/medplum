import { createReference } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

    await waitFor(() => screen.getByText('Homer Simpson'));

    expect(screen.getByText('Homer Simpson')).toBeDefined();
  });

  test('Renders resource directly as link', async () => {
    setup({
      value: HomerSimpson,
      link: true,
    });

    await waitFor(() => screen.getByText('Homer Simpson'));

    expect(screen.getByText('Homer Simpson')).toBeDefined();
  });

  test('Renders after loading the resource', async () => {
    setup({
      value: createReference(HomerSimpson),
    });

    await waitFor(() => screen.getByText('Homer Simpson'));

    expect(screen.getByText('Homer Simpson')).toBeDefined();
  });

  test('Renders operation outcome', async () => {
    setup({
      value: { reference: 'Patient/not-found' },
    });

    await waitFor(() => screen.getByText('[Not found]'));

    expect(screen.getByText('[Not found]')).toBeDefined();
  });
});
