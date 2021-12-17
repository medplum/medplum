import { Patient } from '@medplum/fhirtypes';
import { render, waitFor } from '@testing-library/react';
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

  test('Avatar renders system', () => {
    const utils = setup({ value: { reference: 'system' } });
    expect(utils.getByText('S')).toBeDefined();
  });

  test('Avatar renders initials', () => {
    const utils = setup({ alt: 'Alice Smith' });
    expect(utils.getByTestId('avatar')).toBeDefined();
  });

  test('Avatar renders resource directly', async () => {
    const utils = setup({
      value: patient,
    });

    await waitFor(() => utils.getByTestId('avatar'));

    expect(utils.getByTestId('avatar')).toBeDefined();
  });

  test('Avatar renders resource directly as link', async () => {
    const utils = setup({
      value: patient,
      link: true,
    });

    await waitFor(() => utils.getByTestId('avatar'));

    expect(utils.getByTestId('avatar')).toBeDefined();
  });

  test('Avatar renders after loading the resource', async () => {
    const utils = setup({
      value: {
        reference: 'Patient/' + patient.id,
      },
    });

    await waitFor(() => utils.getByTestId('avatar'));

    expect(utils.getByTestId('avatar')).toBeDefined();
  });
});
