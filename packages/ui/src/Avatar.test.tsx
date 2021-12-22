import { Patient } from '@medplum/fhirtypes';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Avatar, AvatarProps } from './Avatar';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';

const patient: Patient = {
  resourceType: 'Patient',
  id: '123',
  name: [
    {
      given: ['Alice'],
      family: 'Smith',
    },
  ],
  photo: [
    {
      contentType: 'image/jpeg',
      url: 'https://example.com/picture.jpg',
    },
  ],
};

const medplum = new MockClient({
  'fhir/R4/Patient/123': {
    GET: patient,
  },
});

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
    setup({ alt: 'Alice Smith' });
    expect(screen.getByTestId('avatar')).toBeDefined();
  });

  test('Avatar renders resource directly', async () => {
    setup({
      value: patient,
    });

    await waitFor(() => screen.getByTestId('avatar'));

    expect(screen.getByTestId('avatar')).toBeDefined();
  });

  test('Avatar renders resource directly as link', async () => {
    setup({
      value: patient,
      link: true,
    });

    await waitFor(() => screen.getByTestId('avatar'));

    expect(screen.getByTestId('avatar')).toBeDefined();
  });

  test('Avatar renders after loading the resource', async () => {
    setup({
      value: {
        reference: 'Patient/' + patient.id,
      },
    });

    await waitFor(() => screen.getByTestId('avatar'));

    expect(screen.getByTestId('avatar')).toBeDefined();
  });
});
