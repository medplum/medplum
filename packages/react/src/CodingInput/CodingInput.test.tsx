import { InternalSchemaElement } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { CodingInput } from './CodingInput';

const statusProperty: InternalSchemaElement = {
  path: 'Patient.maritalStatus',
  description: "This field contains a patient's most recent marital (civil) status.",
  min: 0,
  max: 1,
  type: [
    {
      code: 'CodeableConcept',
    },
  ],
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

  async function setup(child: React.ReactNode): Promise<void> {
    await act(async () => {
      render(<MedplumProvider medplum={medplum}>{child}</MedplumProvider>);
    });
  }

  test('Renders', async () => {
    await setup(<CodingInput property={statusProperty} name="test" />);

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  test('Renders Coding default value', async () => {
    await setup(<CodingInput property={statusProperty} name="test" defaultValue={{ code: 'abc' }} />);

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByText('abc')).toBeDefined();
  });

  test('Searches for results', async () => {
    await setup(<CodingInput property={statusProperty} name="test" />);

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

    expect(screen.getByText('Test Display')).toBeDefined();
  });

  test('Renders with empty binding property', async () => {
    const statusPropertyEmptyBinding: InternalSchemaElement = {
      ...statusProperty,
      binding: undefined,
    };

    await setup(<CodingInput property={statusPropertyEmptyBinding} name="test" />);

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test Empty' } });
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
    // Despite an undefined binding value, the app still renders and functions
    expect(screen.getByDisplayValue('Test Empty')).toBeDefined();
  });
});
