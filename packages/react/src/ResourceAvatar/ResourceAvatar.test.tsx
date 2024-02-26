import { createReference } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '../test-utils/render';
import { ResourceAvatar, ResourceAvatarProps } from './ResourceAvatar';
import { getInitials } from './ResourceAvatar.utils';

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

    expect(await screen.findByAltText('Homer Simpson')).toBeInTheDocument();
  });

  test('Avatar renders resource directly as link', async () => {
    await setup({
      value: HomerSimpson,
      link: true,
    });

    expect(await screen.findByAltText('Homer Simpson')).toBeInTheDocument();
  });

  test('Avatar renders after loading the resource', async () => {
    await setup({
      value: createReference(HomerSimpson),
    });

    expect(await screen.findByAltText('Homer Simpson')).toBeInTheDocument();
  });

  test('getInitials', () => {
    expect(getInitials('Homer Simpson')).toEqual('HS');
    expect(getInitials('Homer')).toEqual('H');
    expect(getInitials('Homer J Simpson')).toEqual('HS');
    expect(getInitials('')).toEqual('');
  });
});
