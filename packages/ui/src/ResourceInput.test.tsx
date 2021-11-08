import { Bundle, MedplumClient, Patient } from '@medplum/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { ResourceInput, ResourceInputProps } from './ResourceInput';

function mockSearch(): Bundle {
  return {
    resourceType: 'Bundle',
    entry: [{
      resource: {
        resourceType: 'Patient',
        id: randomUUID(),
        name: [{
          given: ['Alice'],
          family: 'Smith'
        }]
      }
    }, {
      resource: {
        resourceType: 'Patient',
        id: randomUUID(),
        name: [{
          given: ['Bob'],
          family: 'Jones'
        }],
        birthDate: '1955-05-05'
      }
    }, {
      resource: {
        resourceType: 'Organization',
        id: randomUUID(),
        name: 'Random Org'
      }
    }]
  };
}

function mockPatient(): Patient {
  return {
    resourceType: 'Patient',
    id: '123',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }]
  }
}

function mockCreateNew(): any {
  return {
    ok: true
  }
}

function mockFetch(url: string, options: any): Promise<any> {
  let result: any;

  if (url.includes('/fhir/R4/Patient?name=')) {
    result = mockSearch();
  } else if (url.includes('/fhir/R4/Patient/123')) {
    result = mockPatient();
  } else if (url.includes('/create-new?')) {
    result = mockCreateNew();
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

const setup = (args: ResourceInputProps) => {
  return render(
    <MedplumProvider medplum={medplum}>
      <ResourceInput {...args} />
    </MedplumProvider>
  );
};

describe('ResourceInput', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty', () => {
    setup({
      resourceType: 'Patient',
      name: 'foo'
    });
    expect(screen.getByTestId('autocomplete')).toBeInTheDocument();
  });

  test('Renders default value', async () => {
    await act(async () => {
      setup({
        resourceType: 'Patient',
        name: 'foo',
        defaultValue: {
          reference: 'Patient/123'
        }
      });
    });
    expect(screen.getByTestId('autocomplete')).toBeInTheDocument();
  });

  test('Use autocomplete', async () => {
    setup({
      resourceType: 'Patient',
      name: 'foo'
    });

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "Alice"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('dropdown'));
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('Alice Smith')).not.toBeUndefined();
  });

  test('Call onChange', async () => {
    const onChange = jest.fn();

    setup({
      resourceType: 'Patient',
      name: 'foo',
      onChange
    });

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "Alice"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('dropdown'));
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('Alice Smith')).not.toBeUndefined();
    expect(onChange).toHaveBeenCalled();
  });

});
