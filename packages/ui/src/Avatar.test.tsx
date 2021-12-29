import { createReference } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Avatar, AvatarProps } from './Avatar';
import { MedplumProvider } from './MedplumProvider';

const medplum = new MockClient();

describe('Avatar', () => {
  const setup = (args: AvatarProps) => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <Avatar {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Avatar renders image', () => {
    setup({ src: 'https://example.com/profile.jpg', alt: 'Profile' });
    expect((screen.getByAltText('Profile') as HTMLImageElement).src).toEqual('https://example.com/profile.jpg');
  });

  test('Avatar renders system', () => {
    setup({ value: { reference: 'system' } });
    expect(screen.getByText('S')).toBeDefined();
  });

  test('Avatar renders initials', () => {
    setup({ alt: 'Homer Simpson' });
    expect(screen.getByTestId('avatar')).toBeDefined();
  });

  test('Avatar renders resource directly', async () => {
    setup({
      value: HomerSimpson,
    });

    await waitFor(() => screen.getByTestId('avatar'));

    expect(screen.getByTestId('avatar')).toBeDefined();
  });

  test('Avatar renders resource directly as link', async () => {
    setup({
      value: HomerSimpson,
      link: true,
    });

    await waitFor(() => screen.getByTestId('avatar'));

    expect(screen.getByTestId('avatar')).toBeDefined();
  });

  test('Avatar renders after loading the resource', async () => {
    setup({
      value: createReference(HomerSimpson),
    });

    await waitFor(() => screen.getByTestId('avatar'));

    expect(screen.getByTestId('avatar')).toBeDefined();
  });
});
