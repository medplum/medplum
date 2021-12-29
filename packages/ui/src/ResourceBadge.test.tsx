import { createReference } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { ResourceBadge, ResourceBadgeProps } from './ResourceBadge';

const medplum = new MockClient();

const setup = (args: ResourceBadgeProps) => {
  return render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <ResourceBadge {...args} />
      </MedplumProvider>
    </MemoryRouter>
  );
};

describe('ResourceBadge', () => {
  test('Renders system', () => {
    const utils = setup({ value: { reference: 'system' } });
    expect(utils.getByText('System')).toBeDefined();
  });

  test('Renders resource directly', async () => {
    const utils = setup({
      value: HomerSimpson,
    });

    await waitFor(() => utils.getByText('Homer Simpson'));

    expect(utils.getByText('Homer Simpson')).toBeDefined();
  });

  test('Renders resource directly as link', async () => {
    const utils = setup({
      value: HomerSimpson,
      link: true,
    });

    await waitFor(() => utils.getByText('Homer Simpson'));

    expect(utils.getByText('Homer Simpson')).toBeDefined();
  });

  test('Renders after loading the resource', async () => {
    const utils = setup({
      value: createReference(HomerSimpson),
    });

    await waitFor(() => utils.getByText('Homer Simpson'));

    expect(utils.getByText('Homer Simpson')).toBeDefined();
  });
});
