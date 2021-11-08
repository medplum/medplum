import { Bundle, MedplumClient, Patient } from '@medplum/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { ReferenceInput, ReferenceInputProps } from './ReferenceInput';

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
        }]
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

const setup = (args: ReferenceInputProps) => {
  return render(
    <MedplumProvider medplum={medplum}>
      <ReferenceInput {...args} />
    </MedplumProvider>
  );
};

describe('ReferenceInput', () => {

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

  test('Renders empty property', () => {
    setup({
      name: 'foo',
      property: {}
    });
    expect(screen.getByTestId('reference-input-resource-type-input')).toBeInTheDocument();
  });

  test('Renders default value resource type', async () => {
    await act(async () => {
      setup({
        name: 'foo',
        property: {},
        defaultValue: {
          reference: 'Patient/123'
        }
      });
    });
    expect(screen.getByTestId('reference-input-resource-type-input')).toBeInTheDocument();
    expect((screen.getByTestId('reference-input-resource-type-input') as HTMLInputElement).value).toBe('Patient');
  });

  test('Change resource type without target types', async () => {
    setup({
      name: 'foo',
      property: {
        type: [{
          code: 'subject'
        }]
      }
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('reference-input-resource-type-input'), { target: { value: 'Practitioner' } });
    });

    expect(screen.getByTestId('reference-input-resource-type-input')).toBeInTheDocument();
  });

  test('Renders property with target types', () => {
    setup({
      name: 'foo',
      property: {
        type: [{
          code: 'subject',
          targetProfile: [
            'Patient',
            'Practitioner'
          ]
        }]
      }
    });
    expect(screen.getByTestId('reference-input-resource-type-select')).toBeInTheDocument();
  });

  test('Change resource type with target types', async () => {
    setup({
      name: 'foo',
      property: {
        type: [{
          code: 'subject',
          targetProfile: [
            'Patient',
            'Practitioner'
          ]
        }]
      }
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('reference-input-resource-type-select'), { target: { value: 'Practitioner' } });
    });

    expect(screen.getByTestId('reference-input-resource-type-select')).toBeInTheDocument();
  });

  test('Use autocomplete', async () => {
    setup({
      name: 'foo',
      property: {
        type: [{
          code: 'subject',
          targetProfile: [
            'Patient',
            'Practitioner'
          ]
        }]
      }
    });

    // Select "Patient" resource type
    await act(async () => {
      fireEvent.change(screen.getByTestId('reference-input-resource-type-select'), { target: { value: 'Patient' } });
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
      name: 'foo',
      property: {
        type: [{
          code: 'subject',
          targetProfile: [
            'Patient',
            'Practitioner'
          ]
        }]
      },
      onChange
    });

    // Select "Patient" resource type
    await act(async () => {
      fireEvent.change(screen.getByTestId('reference-input-resource-type-select'), { target: { value: 'Patient' } });
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
