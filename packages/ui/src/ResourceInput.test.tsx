import { Bundle, Patient } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';
import { ResourceInput, ResourceInputProps } from './ResourceInput';

const alice: Patient = {
  resourceType: 'Patient',
  id: '123',
  name: [{
    given: ['Alice'],
    family: 'Smith'
  }]
};

const bob: Patient = {
  resourceType: 'Patient',
  id: '345',
  name: [{
    given: ['Bob'],
    family: 'Jones'
  }]
};

const searchResult: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: alice
  }, {
    resource: bob
  }]
};

const medplum = new MockClient({
  'auth/login': {
    'POST': {
      profile: { reference: 'Practitioner/123' }
    }
  },
  'fhir/R4/Patient?name=Alice': {
    'GET': searchResult
  },
  'fhir/R4/Patient/123': {
    'GET': alice
  },
});

const setup = (args: ResourceInputProps) => {
  return render(
    <MedplumProvider medplum={medplum}>
      <ResourceInput {...args} />
    </MedplumProvider>
  );
};

describe('ResourceInput', () => {

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

    expect(screen.getByText('Alice Smith')).toBeDefined();
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

    expect(screen.getByText('Alice Smith')).toBeDefined();
    expect(onChange).toHaveBeenCalled();
  });

});
