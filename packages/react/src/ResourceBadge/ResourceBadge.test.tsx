import { createReference } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ResourceBadge, ResourceBadgeProps } from './ResourceBadge';

const medplum = new MockClient();

function setup(args: ResourceBadgeProps): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <ResourceBadge {...args} />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('ResourceBadge', () => {
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
});
