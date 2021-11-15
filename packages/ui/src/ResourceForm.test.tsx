import { Bundle, MedplumClient, Practitioner, User } from '@medplum/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { ResourceForm, ResourceFormProps } from './ResourceForm';

const user: User = {
  resourceType: 'User',
  id: '123'
};

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: '123',
  name: [{ given: ['Medplum'], family: 'Admin' }]
};

const practitionerStructureBundle: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: {
      resourceType: 'StructureDefinition',
      name: 'Practitioner',
      snapshot: {
        element: [
          {
            path: 'Practitioner.id',
            type: [{
              code: 'code'
            }]
          },
          {
            path: 'Practitioner.name',
            type: [{
              code: 'HumanName'
            }],
            max: '*'
          }
        ]
      }
    }
  }]
};

const practitionerSearchParameter: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: {
      resourceType: 'SearchParameter',
      id: 'Practitioner-name',
      code: 'name',
      name: 'name'
    }
  }]
};

function mockFetch(url: string, options: any): Promise<any> {
  const method = options.method ?? 'GET';
  let result: any;

  if (method === 'POST' && url.endsWith('/auth/login')) {
    result = {
      user,
      profile: 'Practitioner/123'
    };
  } else if (method === 'GET' && url.includes('/fhir/R4/StructureDefinition?name:exact=Practitioner')) {
    result = practitionerStructureBundle;
  } else if (method === 'GET' && url.includes('/fhir/R4/SearchParameter?_count=100&base=Practitioner')) {
    result = practitionerSearchParameter;
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Practitioner/123')) {
    result = practitioner;
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...result
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

describe('ResourceForm', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  function setup(props: ResourceFormProps) {
    return render(
      <MedplumProvider medplum={medplum}>
        <ResourceForm {...props} />
      </MedplumProvider>
    );
  }

  test('Error on missing resource type', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: {},
      onSubmit
    });
  });

  test('Renders empty Practitioner form', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: {
        resourceType: 'Practitioner'
      },
      onSubmit
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    const control = screen.getByText('Resource Type');
    expect(control).not.toBeUndefined();
  });

  test('Renders Practitioner resource', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: {
        reference: 'Practitioner/123'
      },
      onSubmit
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    const control = screen.getByText('Resource Type');
    expect(control).not.toBeUndefined();
  });

  test('Submit form', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: {
        resourceType: 'Practitioner'
      },
      onSubmit
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();
  });

});
