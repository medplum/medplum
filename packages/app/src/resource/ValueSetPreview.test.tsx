// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Parameters, ValueSet } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { ValueSetPreview } from './ValueSetPreview';

const medplum = new MockClient();

describe('ValueSetPreview', () => {
  async function setup(valueSet: ValueSet): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter>
            <MantineProvider>
              <Notifications />
              <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                  <ValueSetPreview valueSet={valueSet} />
                </Suspense>
              </ErrorBoundary>
            </MantineProvider>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  async function selectValue(input: HTMLInputElement, searchText: string): Promise<void> {
    // Type to trigger search
    await act(async () => {
      fireEvent.change(input, { target: { value: searchText } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow to select first option
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter" to confirm selection
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders ValueSetAutocomplete', async () => {
    const valueSet = await medplum.createResource<ValueSet>({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/valueset/test',
      expansion: {
        timestamp: '2023-01-01T00:00:00.000Z',
        contains: [
          {
            system: 'http://example.com/codesystem',
            code: 'code1',
            display: 'Display 1',
          },
        ],
      },
    });

    // Mock valueSetExpand
    medplum.valueSetExpand = jest.fn().mockResolvedValue(valueSet);

    await setup(valueSet);

    expect(await screen.findByPlaceholderText('Select a value from the ValueSet')).toBeInTheDocument();
  });

  test('Displays selected value details', async () => {
    const valueSet = await medplum.createResource<ValueSet>({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/valueset/test',
      expansion: {
        timestamp: '2023-01-01T00:00:00.000Z',
        contains: [
          {
            system: 'http://example.com/codesystem',
            code: 'code1',
            display: 'Display 1',
          },
        ],
      },
    });

    medplum.valueSetExpand = jest.fn().mockResolvedValue(valueSet);
    medplum.get = jest.fn().mockResolvedValue({
      resourceType: 'Parameters',
      parameter: [],
    });

    await setup(valueSet);

    const input = (await screen.findByPlaceholderText('Select a value from the ValueSet')) as HTMLInputElement;
    await selectValue(input, 'Display');

    // Wait for lookup to complete
    await waitFor(() => {
      expect(medplum.get).toHaveBeenCalled();
    });

    // Verify selected value details are displayed
    // The values appear in the DescriptionList, but may also appear in the autocomplete pill
    // So we check that they exist somewhere in the document
    await waitFor(() => {
      // Check that the values appear (they might be in the pill or in the description list)
      const allCode1 = screen.queryAllByText('code1');
      expect(allCode1.length).toBeGreaterThan(0);

      const allSystem = screen.queryAllByText('http://example.com/codesystem');
      expect(allSystem.length).toBeGreaterThan(0);

      const allDisplay1 = screen.queryAllByText('Display 1');
      expect(allDisplay1.length).toBeGreaterThan(0);
    });
  });

  test('Calls CodeSystem lookup when value is selected', async () => {
    const valueSet = await medplum.createResource<ValueSet>({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/valueset/test',
      expansion: {
        timestamp: '2023-01-01T00:00:00.000Z',
        contains: [
          {
            system: 'http://example.com/codesystem',
            code: 'code1',
            display: 'Display 1',
          },
        ],
      },
    });

    const lookupResult: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'name', valueString: 'Test Code System' },
        { name: 'display', valueString: 'Display 1' },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'parent' },
            { name: 'value', valueCode: 'parent-code' },
            { name: 'description', valueString: 'Parent code' },
          ],
        },
      ],
    };

    medplum.valueSetExpand = jest.fn().mockResolvedValue(valueSet);
    medplum.get = jest.fn().mockResolvedValue(lookupResult);

    await setup(valueSet);

    const input = (await screen.findByPlaceholderText('Select a value from the ValueSet')) as HTMLInputElement;
    await selectValue(input, 'Display');

    // Wait for lookup to be called
    await waitFor(() => {
      expect(medplum.get).toHaveBeenCalled();
    });

    // Check that lookup was called with the correct URL (URL-encoded)
    expect(medplum.get).toHaveBeenCalledWith(expect.stringContaining('CodeSystem/$lookup'));
    expect(medplum.get).toHaveBeenCalledWith(expect.stringContaining('system=http%3A%2F%2Fexample.com%2Fcodesystem'));
    expect(medplum.get).toHaveBeenCalledWith(expect.stringContaining('code=code1'));
  });

  test('Shows loading state during lookup', async () => {
    const valueSet = await medplum.createResource<ValueSet>({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/valueset/test',
      expansion: {
        timestamp: '2023-01-01T00:00:00.000Z',
        contains: [
          {
            system: 'http://example.com/codesystem',
            code: 'code1',
            display: 'Display 1',
          },
        ],
      },
    });

    medplum.valueSetExpand = jest.fn().mockResolvedValue(valueSet);
    // Mock a delayed lookup response
    let resolveLookup: (value: Parameters) => void;
    const lookupPromise = new Promise<Parameters>((resolve) => {
      resolveLookup = resolve;
    });
    medplum.get = jest.fn().mockReturnValue(lookupPromise);

    await setup(valueSet);

    const input = (await screen.findByPlaceholderText('Select a value from the ValueSet')) as HTMLInputElement;
    await selectValue(input, 'Display');

    // Verify loading state appears
    expect(await screen.findByText('Loading properties...')).toBeInTheDocument();

    // Resolve the lookup
    await act(async () => {
      if (resolveLookup) {
        resolveLookup({
          resourceType: 'Parameters',
          parameter: [{ name: 'display', valueString: 'Display 1' }],
        });
        await lookupPromise;
      }
    });

    // Loading should disappear
    await waitFor(() => {
      expect(screen.queryByText('Loading properties...')).not.toBeInTheDocument();
    });
  });

  test('Displays error when lookup fails', async () => {
    const valueSet = await medplum.createResource<ValueSet>({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/valueset/test',
      expansion: {
        timestamp: '2023-01-01T00:00:00.000Z',
        contains: [
          {
            system: 'http://example.com/codesystem',
            code: 'code1',
            display: 'Display 1',
          },
        ],
      },
    });

    medplum.valueSetExpand = jest.fn().mockResolvedValue(valueSet);
    medplum.get = jest.fn().mockRejectedValue(new Error('Lookup failed'));

    await setup(valueSet);

    const input = (await screen.findByPlaceholderText('Select a value from the ValueSet')) as HTMLInputElement;
    await selectValue(input, 'Display');

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByText(/Lookup Failed/)).toBeInTheDocument();
      expect(screen.getByText(/Failed to retrieve code information/)).toBeInTheDocument();
    });
  });

  test('Does not render properties section when lookup has no properties', async () => {
    const valueSet = await medplum.createResource<ValueSet>({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/valueset/test',
      expansion: {
        timestamp: '2023-01-01T00:00:00.000Z',
        contains: [
          {
            system: 'http://example.com/codesystem',
            code: 'code1',
            display: 'Display 1',
          },
        ],
      },
    });

    const lookupResult: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'name', valueString: 'Test Code System' },
        { name: 'display', valueString: 'Display 1' },
        // No property parameters
      ],
    };

    medplum.valueSetExpand = jest.fn().mockResolvedValue(valueSet);
    medplum.get = jest.fn().mockResolvedValue(lookupResult);

    await setup(valueSet);

    const input = (await screen.findByPlaceholderText('Select a value from the ValueSet')) as HTMLInputElement;
    await selectValue(input, 'Display');

    // Wait for lookup to complete
    await waitFor(() => {
      expect(medplum.get).toHaveBeenCalled();
    });

    // Verify that Code, System, and Display are shown
    expect(await screen.findByText('code1')).toBeInTheDocument();
    // But no properties section should be rendered
    expect(screen.queryByText('Properties')).not.toBeInTheDocument();
  });

  test('Renders properties when lookup returns properties', async () => {
    const valueSet = await medplum.createResource<ValueSet>({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/valueset/test',
      expansion: {
        timestamp: '2023-01-01T00:00:00.000Z',
        contains: [
          {
            system: 'http://example.com/codesystem',
            code: 'code1',
            display: 'Display 1',
          },
        ],
      },
    });

    const lookupResult: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'parent' },
            { name: 'value', valueCode: 'parent-code' },
            { name: 'description', valueString: 'Parent code' },
          ],
        },
      ],
    };

    medplum.valueSetExpand = jest.fn().mockResolvedValue(valueSet);
    medplum.get = jest.fn().mockResolvedValue(lookupResult);

    await setup(valueSet);

    const input = (await screen.findByPlaceholderText('Select a value from the ValueSet')) as HTMLInputElement;
    await selectValue(input, 'Display');

    // Wait for properties to be rendered
    await waitFor(() => {
      expect(screen.getByText('Properties')).toBeInTheDocument();
      expect(screen.getByText('parent')).toBeInTheDocument();
      expect(screen.getByText('parent-code')).toBeInTheDocument();
      expect(screen.getByText('Parent code')).toBeInTheDocument();
    });
  });

  test('Renders properties with different value types', async () => {
    const valueSet = await medplum.createResource<ValueSet>({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/valueset/test',
      expansion: {
        timestamp: '2023-01-01T00:00:00.000Z',
        contains: [
          {
            system: 'http://example.com/codesystem',
            code: 'code1',
            display: 'Display 1',
          },
        ],
      },
    });

    const lookupResult: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'test1' },
            { name: 'value', valueString: 'string-value' },
            { name: 'description', valueString: 'String property' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'test2' },
            { name: 'value', valueBoolean: true },
            { name: 'description', valueString: 'Boolean property' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'test3' },
            { name: 'value', valueInteger: 42 },
            { name: 'description', valueString: 'Integer property' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'test4' },
            { name: 'value', valueDecimal: 3.14 },
            { name: 'description', valueString: 'Decimal property' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'test5' },
            { name: 'value', valueDate: '2023-01-01' },
            { name: 'description', valueString: 'Date property' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'test6' },
            { name: 'value', valueDateTime: '2023-01-01T12:00:00Z' },
            { name: 'description', valueString: 'DateTime property' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'test7' },
            { name: 'value', valueCode: 'code-value' },
            { name: 'description', valueString: 'Code property' },
          ],
        },
      ],
    };

    medplum.valueSetExpand = jest.fn().mockResolvedValue(valueSet);
    medplum.get = jest.fn().mockResolvedValue(lookupResult);

    await setup(valueSet);

    const input = (await screen.findByPlaceholderText('Select a value from the ValueSet')) as HTMLInputElement;
    await selectValue(input, 'Display');

    // Wait for all properties to be rendered
    await waitFor(() => {
      expect(screen.getByText('string-value')).toBeInTheDocument();
      expect(screen.getByText('true')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('3.14')).toBeInTheDocument();
      expect(screen.getByText('2023-01-01')).toBeInTheDocument();
      expect(screen.getByText('2023-01-01T12:00:00Z')).toBeInTheDocument();
      expect(screen.getByText('code-value')).toBeInTheDocument();
    });
  });

  test('Handles property with no value (shows N/A)', async () => {
    const valueSet = await medplum.createResource<ValueSet>({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/valueset/test',
      expansion: {
        timestamp: '2023-01-01T00:00:00.000Z',
        contains: [
          {
            system: 'http://example.com/codesystem',
            code: 'code1',
            display: 'Display 1',
          },
        ],
      },
    });

    const lookupResult: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'test' },
            { name: 'value' }, // No value provided
            { name: 'description', valueString: 'No value property' },
          ],
        },
      ],
    };

    medplum.valueSetExpand = jest.fn().mockResolvedValue(valueSet);
    medplum.get = jest.fn().mockResolvedValue(lookupResult);

    await setup(valueSet);

    const input = (await screen.findByPlaceholderText('Select a value from the ValueSet')) as HTMLInputElement;
    await selectValue(input, 'Display');

    // Wait for property to be rendered with N/A
    await waitFor(() => {
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });
  });

  test('Handles value without display', async () => {
    const valueSet = await medplum.createResource<ValueSet>({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/valueset/test',
      expansion: {
        timestamp: '2023-01-01T00:00:00.000Z',
        contains: [
          {
            system: 'http://example.com/codesystem',
            code: 'code1',
            // No display - but ValueSetAutocomplete might add one, so we'll test differently
          },
        ],
      },
    });

    medplum.valueSetExpand = jest.fn().mockResolvedValue(valueSet);
    medplum.get = jest.fn().mockResolvedValue({
      resourceType: 'Parameters',
      parameter: [],
    });

    await setup(valueSet);

    const input = (await screen.findByPlaceholderText('Select a value from the ValueSet')) as HTMLInputElement;

    // Type to trigger search
    await act(async () => {
      fireEvent.change(input, { target: { value: 'code' } });
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

    // Wait for lookup to complete
    await waitFor(
      () => {
        expect(medplum.get).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Code and System should be displayed
    await waitFor(() => {
      // The values appear in the DescriptionList, but may also appear in the autocomplete pill
      const allCode1 = screen.queryAllByText('code1');
      expect(allCode1.length).toBeGreaterThan(0);

      const allSystem = screen.queryAllByText('http://example.com/codesystem');
      expect(allSystem.length).toBeGreaterThan(0);
    });
  });

  test('Handles property with unknown part name', async () => {
    const valueSet = await medplum.createResource<ValueSet>({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/valueset/test',
      expansion: {
        timestamp: '2023-01-01T00:00:00.000Z',
        contains: [
          {
            system: 'http://example.com/codesystem',
            code: 'code1',
            display: 'Display 1',
          },
        ],
      },
    });

    const lookupResult: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'test' },
            { name: 'unknownPart', valueString: 'unknown value' }, // Unknown part name
            { name: 'description', valueString: 'Test property' },
          ],
        },
      ],
    };

    medplum.valueSetExpand = jest.fn().mockResolvedValue(valueSet);
    medplum.get = jest.fn().mockResolvedValue(lookupResult);

    await setup(valueSet);

    const input = (await screen.findByPlaceholderText('Select a value from the ValueSet')) as HTMLInputElement;
    await selectValue(input, 'Display');

    // Wait for properties to be rendered
    await waitFor(() => {
      expect(screen.getByText('Properties')).toBeInTheDocument();
      expect(screen.getByText('test')).toBeInTheDocument();
      expect(screen.getByText('Test property')).toBeInTheDocument();
    });

    // Unknown part should be ignored (return null), so unknown value should not appear
    expect(screen.queryByText('unknown value')).not.toBeInTheDocument();
  });
});
