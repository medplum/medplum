import { createReference } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '../test-utils/render';
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

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    expect(screen.getByText('Homer Simpson')).toBeDefined();
  });

  test('Renders resource directly as link', async () => {
    setup({
      value: HomerSimpson,
      link: true,
    });

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    expect(screen.getByText('Homer Simpson')).toBeDefined();
  });

  test('Renders after loading the resource', async () => {
    setup({
      value: createReference(HomerSimpson),
    });

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    expect(screen.getByText('Homer Simpson')).toBeDefined();
  });
});
