import { Bundle, MedplumClient, Observation, Practitioner, User } from '@medplum/core';
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

const observation: Observation = {
  resourceType: 'Observation',
  id: '123',
  code: {
    coding: [{
      system: 'http://loinc.org',
      code: '123',
      display: 'Test Observation'
    }]
  },
  valueQuantity: {
    value: 1,
    unit: 'kg'
  }
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

const observationStructureBundle: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: {
      resourceType: 'StructureDefinition',
      name: 'Observation',
      snapshot: {
        element: [
          {
            path: 'Observation.id',
            type: [{
              code: 'code'
            }]
          },
          {
            path: 'Observation.value[x]',
            type: [
              { code: 'Quantity' },
              { code: 'string' },
              { code: 'integer' },
            ]
          }
        ]
      }
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
  } else if (method === 'GET' && url.includes('/fhir/R4/StructureDefinition?name:exact=Observation')) {
    result = observationStructureBundle;
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Practitioner/123')) {
    result = practitioner;
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Observation/123')) {
    result = observation;
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

  test('Submit Practitioner', async () => {
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

  test('Renders empty Observation form', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: {
        resourceType: 'Observation'
      },
      onSubmit
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    const control = screen.getByText('Resource Type');
    expect(control).not.toBeUndefined();
  });

  test('Renders Observation resource', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: {
        reference: 'Observation/123'
      },
      onSubmit
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    const control = screen.getByText('Resource Type');
    expect(control).not.toBeUndefined();
  });

  test('Submit Observation', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: {
        resourceType: 'Observation',
        valueQuantity: {
          value: 1,
          unit: 'kg'
        }
      },
      onSubmit
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    // Change the value[x] from Quantity to string
    // and set a value
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Quantity'), { target: { value: 'string' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('value[x]'), { target: { value: 'hello' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();

    const result = onSubmit.mock.calls[0][0];
    expect(result.resourceType).toBe('Observation');
    expect(result.valueQuantity).toBeUndefined();
    expect(result.valueString).toBe('hello');
  });

});
