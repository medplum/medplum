// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import { HomerSimpson, MargeSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { ResourcesInputProps } from './ResourcesInput';
import { ResourcesInput } from './ResourcesInput';

const medplum = new MockClient();

function setup(args: ResourcesInputProps): void {
  render(
    <MedplumProvider medplum={medplum}>
      <ResourcesInput {...args} />
    </MedplumProvider>
  );
}

describe('ResourcesInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty', () => {
    setup({
      resourceType: 'Patient',
      name: 'foo',
      placeholder: 'Test',
    });
    expect(screen.getByPlaceholderText('Test')).toBeInTheDocument();
  });

  test('Renders default value from reference', async () => {
    await act(async () => {
      setup({
        resourceType: 'Patient',
        name: 'foo',
        defaultValue: [createReference(HomerSimpson)],
        placeholder: 'Test',
      });
    });
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Renders multiple default values from resources', async () => {
    await act(async () => {
      setup({
        resourceType: 'Patient',
        name: 'foo',
        defaultValue: [HomerSimpson, MargeSimpson],
        placeholder: 'Test',
      });
    });
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Marge Simpson')).toBeInTheDocument();
  });

  test('Renders default values from references', async () => {
    await act(async () => {
      setup({
        resourceType: 'Patient',
        name: 'foo',
        defaultValue: [createReference(HomerSimpson)],
        placeholder: 'Test',
      });
    });
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Use autocomplete', async () => {
    setup({
      resourceType: 'Patient',
      name: 'foo',
      placeholder: 'Test',
    });

    const input = screen.getByPlaceholderText('Test');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Simpson' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Homer Simpson')).toBeDefined();
  });

  test('Call onChange with array when item is selected', async () => {
    const onChange = jest.fn();

    setup({
      resourceType: 'Patient',
      name: 'foo',
      placeholder: 'Test',
      onChange,
    });

    const input = screen.getByPlaceholderText('Test');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Simpson' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(onChange).toHaveBeenCalled();
    const callArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(Array.isArray(callArg)).toBe(true);
    expect(callArg.length).toBeGreaterThan(0);
    expect(callArg[0]).toMatchObject({ resourceType: 'Patient' });
  });

  test('Input remains available after selection (no maxValues cap)', async () => {
    setup({
      resourceType: 'Patient',
      name: 'foo',
      placeholder: 'Test',
    });

    const input = screen.getByPlaceholderText('Test');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Simpson' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Input field is still shown because maxValues is uncapped
    expect(screen.getByPlaceholderText('Test')).toBeInTheDocument();
  });

  test('Clear all button calls onChange with empty array', async () => {
    const onChange = jest.fn();

    await act(async () => {
      setup({
        resourceType: 'Patient',
        name: 'foo',
        defaultValue: [HomerSimpson],
        placeholder: 'Test',
        onChange,
      });
    });

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    const clearAllButton = screen.getByTitle('Clear all');
    await act(async () => {
      fireEvent.click(clearAllButton);
    });

    expect(onChange).toHaveBeenCalledWith([]);
  });

  test('Handle invalid reference in defaultValue', async () => {
    await act(async () => {
      setup({
        resourceType: 'Patient',
        name: 'foo',
        defaultValue: [{ reference: '' }],
        placeholder: 'Test',
      });
    });

    expect(await screen.findByPlaceholderText('Test')).toBeInTheDocument();
  });

  test('Respects maxValues — hides input after limit is reached', async () => {
    setup({
      resourceType: 'Patient',
      name: 'foo',
      placeholder: 'Test',
      maxValues: 1,
    });

    const input = screen.getByPlaceholderText('Test');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Simpson' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // After selecting one item with maxValues=1, the input field should no longer be shown
    expect(screen.queryByPlaceholderText('Test')).not.toBeInTheDocument();
  });
});
