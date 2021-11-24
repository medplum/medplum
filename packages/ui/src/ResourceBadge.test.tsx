import { Patient } from '@medplum/core';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';
import { ResourceBadge, ResourceBadgeProps } from './ResourceBadge';

const patient: Patient = {
  resourceType: 'Patient',
  id: '123',
  meta: {
    versionId: '456'
  },
  name: [{
    given: ['Alice'],
    family: 'Smith'
  }]
};

const medplum = new MockClient({
  'auth/login': {
    'POST': {
      profile: { reference: 'Practitioner/123' }
    }
  },
  'fhir/R4/Patient/123': {
    'GET': patient
  },
});

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
    expect(utils.getByText('System')).not.toBeUndefined();
  });

  test('Renders resource directly', async () => {
    const utils = setup({
      value: patient
    });

    await waitFor(() => utils.getByText('Alice Smith'));

    expect(utils.getByText('Alice Smith')).not.toBeUndefined();
  });

  test('Renders resource directly as link', async () => {
    const utils = setup({
      value: patient,
      link: true
    });

    await waitFor(() => utils.getByText('Alice Smith'));

    expect(utils.getByText('Alice Smith')).not.toBeUndefined();
  });

  test('Renders after loading the resource', async () => {
    const utils = setup({
      value: {
        reference: 'Patient/' + patient.id
      }
    });

    await waitFor(() => utils.getByText('Alice Smith'));

    expect(utils.getByText('Alice Smith')).not.toBeUndefined();
  });

});
