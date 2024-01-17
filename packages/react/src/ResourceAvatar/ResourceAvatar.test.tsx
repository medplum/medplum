import { createReference } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen, waitFor } from '../test-utils/render';
import { MemoryRouter } from 'react-router-dom';
import { ResourceAvatar, ResourceAvatarProps } from './ResourceAvatar';

const medplum = new MockClient();

describe('ResourceAvatar', () => {
  async function setup(args: ResourceAvatarProps): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <ResourceAvatar {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Avatar renders image', async () => {
    await setup({ src: 'https://example.com/profile.jpg', alt: 'Profile' });
    expect((screen.getByAltText('Profile') as HTMLImageElement).src).toEqual('https://example.com/profile.jpg');
  });

  test('Avatar renders system', async () => {
    await setup({ value: { reference: 'system' } });
    expect(screen.getByTitle('System')).toBeDefined();
  });

  test('Avatar renders initials', async () => {
    await setup({ alt: 'Homer Simpson' });
    expect(screen.getByTitle('Homer Simpson')).toBeDefined();
  });

  test('Avatar renders resource directly', async () => {
    await setup({
      value: HomerSimpson,
    });

    await waitFor(() => screen.getByAltText('Homer Simpson'));

    expect(screen.getByAltText('Homer Simpson')).toBeDefined();
  });

  test('Avatar renders resource directly as link', async () => {
    await setup({
      value: HomerSimpson,
      link: true,
    });

    await waitFor(() => screen.getByAltText('Homer Simpson'));

    expect(screen.getByAltText('Homer Simpson')).toBeDefined();
  });

  test('Avatar renders after loading the resource', async () => {
    await setup({
      value: createReference(HomerSimpson),
    });

    await waitFor(() => screen.getByAltText('Homer Simpson'));

    expect(screen.getByAltText('Homer Simpson')).toBeDefined();
  });
});
