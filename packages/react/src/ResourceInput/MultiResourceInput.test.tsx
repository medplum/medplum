// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { HomerSimpson, MargeSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useState } from 'react';
import { AsyncAutocompleteTestIds } from '../AsyncAutocomplete/AsyncAutocomplete.utils';
import {
  act,
  clickAutocompleteOption,
  fireEvent,
  render,
  screen,
  selectAutocompleteOption,
  typeInAutocomplete,
  within,
} from '../test-utils/render';
import type { MultiResourceInputProps } from './MultiResourceInput';
import { MultiResourceInput } from './MultiResourceInput';

const medplum = new MockClient();

function setup(args: MultiResourceInputProps): void {
  render(
    <MedplumProvider medplum={medplum}>
      <MultiResourceInput {...args} />
    </MedplumProvider>
  );
}

describe('MultiResourceInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
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
    await typeInAutocomplete(input, 'Simpson');
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Call onChange with array when item is selected', async () => {
    const onChange = vi.fn();

    setup({
      resourceType: 'Patient',
      name: 'foo',
      placeholder: 'Test',
      onChange,
    });

    const input = screen.getByPlaceholderText('Test');
    await typeInAutocomplete(input, 'Simpson');
    await clickAutocompleteOption('Homer Simpson');

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
    await selectAutocompleteOption(input, 'Simpson', 'Homer Simpson');

    // Input field is still shown because maxValues is uncapped
    expect(screen.getByPlaceholderText('Test')).toBeInTheDocument();
  });

  test('Clear all button calls onChange with empty array', async () => {
    const onChange = vi.fn();

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
    await selectAutocompleteOption(input, 'Simpson', 'Homer Simpson');

    // After selecting one item with maxValues=1, the input field should no longer be shown
    expect(screen.queryByPlaceholderText('Test')).not.toBeInTheDocument();
  });

  describe('controlled', () => {
    function pills(): ReturnType<typeof within> {
      return within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    }

    function renderControlled(
      value: MultiResourceInputProps<Patient>['value']
    ): (value: MultiResourceInputProps<Patient>['value']) => Promise<void> {
      const ui = (v: typeof value): JSX.Element => (
        <MedplumProvider medplum={medplum}>
          <MultiResourceInput<Patient> resourceType="Patient" name="foo" placeholder="Test" value={v} />
        </MedplumProvider>
      );
      const { rerender } = render(ui(value));
      return async (next) => {
        await act(async () => rerender(ui(next)));
      };
    }

    test('resolves references and follows value from the parent', async () => {
      const setValue = renderControlled([createReference(HomerSimpson)]);
      expect(await pills().findByText('Homer Simpson')).toBeInTheDocument();
      const input = screen.getByPlaceholderText('Test');

      await setValue([MargeSimpson]);
      expect(pills().queryByText('Homer Simpson')).not.toBeInTheDocument();
      expect(pills().getByText('Marge Simpson')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Test')).toBe(input);

      await setValue([]);
      expect(pills().queryByText('Marge Simpson')).not.toBeInTheDocument();
    });

    test('leaves out references that cannot be read', async () => {
      renderControlled([createReference(HomerSimpson), { reference: 'Patient/does-not-exist' }]);
      expect(await pills().findByText('Homer Simpson')).toBeInTheDocument();
    });

    test('a pick stored as a reference comes back without a refetch', async () => {
      function Parent(): JSX.Element {
        const [value, setValue] = useState<Reference<Patient>[]>([]);
        return (
          <MultiResourceInput<Patient>
            resourceType="Patient"
            name="foo"
            placeholder="Test"
            value={value}
            onChange={(patients) => setValue(patients.map(createReference))}
          />
        );
      }
      render(
        <MedplumProvider medplum={medplum}>
          <Parent />
        </MedplumProvider>
      );
      const readReference = vi.spyOn(medplum, 'readReference');

      await typeInAutocomplete(screen.getByPlaceholderText('Test'), 'Simpson');
      await clickAutocompleteOption('Homer Simpson');

      expect(pills().getByText('Homer Simpson')).toBeInTheDocument();
      expect(readReference).not.toHaveBeenCalled();
      readReference.mockRestore();
    });
  });
});
