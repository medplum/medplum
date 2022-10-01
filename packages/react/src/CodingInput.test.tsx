import { ElementDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { CodingInput } from './CodingInput';
import { MedplumProvider } from './MedplumProvider';

const statusProperty: ElementDefinition = {
  binding: {
    valueSet: 'https://example.com/test',
  },
};

const medplum = new MockClient();

describe('CodingInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
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

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  test('Renders Coding default value', () => {
    render(
      <MedplumProvider medplum={medplum}>
        <CodingInput property={statusProperty} name="test" defaultValue={{ code: 'abc' }} />
      </MedplumProvider>
    );

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByDisplayValue('abc')).toBeDefined();
  });

  test('Searches for results', async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <CodingInput property={statusProperty} name="test" />
      </MedplumProvider>
    );

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByDisplayValue('Test Display')).toBeDefined();
  });
});
