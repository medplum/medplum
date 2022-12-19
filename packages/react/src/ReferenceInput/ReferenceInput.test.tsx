import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { ReferenceInput, ReferenceInputProps } from './ReferenceInput';

const medplum = new MockClient();

function setup(args: ReferenceInputProps): void {
  render(
    <MedplumProvider medplum={medplum}>
      <ReferenceInput {...args} />
    </MedplumProvider>
  );
}

describe('ReferenceInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty property', () => {
    setup({
      name: 'foo',
    });
    expect(screen.getByTestId('reference-input-resource-type-input')).toBeInTheDocument();
  });

  test('Renders default value resource type', async () => {
    await act(async () => {
      setup({
        name: 'foo',
        defaultValue: {
          reference: 'Patient/123',
        },
      });
    });
    expect(screen.getByTestId('reference-input-resource-type-input')).toBeInTheDocument();
    expect((screen.getByTestId('reference-input-resource-type-input') as HTMLInputElement).value).toBe('Patient');
  });

  test('Change resource type without target types', async () => {
    setup({
      name: 'foo',
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('reference-input-resource-type-input'), {
        target: { value: 'Practitioner' },
      });
    });

    expect(screen.getByTestId('reference-input-resource-type-input')).toBeInTheDocument();
  });

  test('Renders property with target types', () => {
    setup({
      name: 'foo',
      targetTypes: ['Patient', 'Practitioner'],
    });
    expect(screen.getByTestId('reference-input-resource-type-select')).toBeInTheDocument();
  });

  test('Change resource type with target types', async () => {
    setup({
      name: 'foo',
      targetTypes: ['Patient', 'Practitioner'],
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('reference-input-resource-type-select'), {
        target: { value: 'Practitioner' },
      });
    });

    expect(screen.getByTestId('reference-input-resource-type-select')).toBeInTheDocument();
  });

  test('Use autocomplete', async () => {
    setup({
      name: 'foo',
      targetTypes: ['Patient', 'Practitioner'],
      placeholder: 'Test',
    });

    // Select "Patient" resource type
    await act(async () => {
      fireEvent.change(screen.getByTestId('reference-input-resource-type-select'), { target: { value: 'Patient' } });
    });

    const input = screen.getByPlaceholderText('Test') as HTMLInputElement;

    // Enter "Simpson"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Simpson' } });
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

    expect(screen.getByDisplayValue('Homer Simpson')).toBeDefined();
  });

  test('Call onChange', async () => {
    const onChange = jest.fn();

    setup({
      name: 'foo',
      targetTypes: ['Patient', 'Practitioner'],
      placeholder: 'Test',
      onChange,
    });

    // Select "Patient" resource type
    await act(async () => {
      fireEvent.change(screen.getByTestId('reference-input-resource-type-select'), { target: { value: 'Patient' } });
    });

    const input = screen.getByPlaceholderText('Test') as HTMLInputElement;

    // Enter "Simpson"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Simpson' } });
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

    expect(screen.getByDisplayValue('Homer Simpson')).toBeDefined();
    expect(onChange).toHaveBeenCalled();
  });

  test('Handle empty target types', async () => {
    setup({
      name: 'foo',
      targetTypes: [],
    });
    expect(screen.getByTestId('reference-input-resource-type-input')).toBeInTheDocument();
    expect(screen.queryByTestId('reference-input-resource-type-select')).not.toBeInTheDocument();
  });

  test('Handle Resource target type', async () => {
    setup({
      name: 'foo',
      targetTypes: ['Resource'],
    });
    // "Resource" is a FHIR special case that means "any resource type"
    expect(screen.getByTestId('reference-input-resource-type-input')).toBeInTheDocument();
    expect(screen.queryByTestId('reference-input-resource-type-select')).not.toBeInTheDocument();
  });
});
