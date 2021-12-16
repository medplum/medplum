import { ElementDefinition, ValueSet } from '@medplum/fhirtypes';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { CodingInput } from './CodingInput';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';

const statusProperty: ElementDefinition = {
  binding: {
    valueSet: 'https://example.com/test'
  }
};

const valueSet: ValueSet = {
  resourceType: 'ValueSet',
  expansion: {
    contains: [{
      system: 'x',
      code: 'test-code',
      display: 'Test Display'
    }]
  }
};

const medplum = new MockClient({
  'fhir/R4/ValueSet/%24expand?url=https%3A%2F%2Fexample.com%2Ftest&filter=xyz': {
    'GET': valueSet
  }
});

describe('CodingInput', () => {

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', () => {
    render(
      <MedplumProvider medplum={medplum}>
        <CodingInput property={statusProperty} name="test" />
      </MedplumProvider>
    );

    expect(screen.getByTestId('autocomplete')).toBeInTheDocument();
  });

  test('Renders Coding default value', () => {
    render(
      <MedplumProvider medplum={medplum}>
        <CodingInput property={statusProperty} name="test" defaultValue={{ code: 'abc' }} />
      </MedplumProvider>
    );

    expect(screen.getByTestId('autocomplete')).toBeInTheDocument();
    expect(screen.getByText('abc')).toBeDefined();
  });

  test('Searches for results', async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <CodingInput property={statusProperty} name="test" />
      </MedplumProvider>
    );

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'xyz' } });
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

    expect(screen.getByText('Test Display')).toBeDefined();
  });

});
