// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatAddress } from '@medplum/core';
import type { Patient, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { forwardRef } from 'react';
import type { AsyncAutocompleteOption } from '../AsyncAutocomplete/AsyncAutocomplete';
import { act, clickAutocompleteOption, fireEvent, render, screen, typeInAutocomplete } from '../test-utils/render';
import type { ResourceInputProps } from './ResourceInput';
import { ResourceInput } from './ResourceInput';

const medplum = new MockClient();

function setup(args: ResourceInputProps): void {
  render(
    <MedplumProvider medplum={medplum}>
      <ResourceInput {...args} />
    </MedplumProvider>
  );
}

describe('ResourceInput', () => {
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

  test('Renders default value', async () => {
    await act(async () => {
      setup({
        resourceType: 'Patient',
        name: 'foo',
        defaultValue: {
          reference: 'Patient/123',
        },
        placeholder: 'Test',
      });
    });
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
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

  test('Call onChange', async () => {
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
  });

  test('Handle invalid reference default value', async () => {
    await act(async () => {
      setup({
        resourceType: 'Patient',
        name: 'foo',
        defaultValue: {
          reference: '',
        },
        placeholder: 'Test',
      });
    });

    expect(await screen.findByPlaceholderText('Test')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Test')).toBeInTheDocument();
  });

  test('Clear button calls onChange', async () => {
    const onChange = vi.fn();

    await act(async () => {
      setup({
        resourceType: 'Patient',
        name: 'foo',
        defaultValue: { reference: 'Patient/123' },
        placeholder: 'Test',
        onChange,
      });
    });

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();

    const nameSpan = screen.getByText('Homer Simpson');
    const clearButton = nameSpan.parentElement?.childNodes[1] as HTMLImageElement;
    expect(clearButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(clearButton);
    });

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  test('Clear all button calls onChange', async () => {
    const onChange = vi.fn();

    await act(async () => {
      setup({
        resourceType: 'Patient',
        name: 'foo',
        defaultValue: { reference: 'Patient/123' },
        placeholder: 'Test',
        onChange,
      });
    });

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();

    const clearAllButton = screen.getByTitle('Clear all');
    expect(clearAllButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(clearAllButton);
    });

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  test('Custom item component', async () => {
    const MyTestItemComponent = forwardRef<HTMLDivElement, AsyncAutocompleteOption<Resource>>(
      ({ label, resource, active: _active, ...others }: AsyncAutocompleteOption<Resource>, ref) => {
        const address = (resource as Patient).address?.[0];
        return (
          <div ref={ref} {...others}>
            <div>{label}</div>
            <div>{address && formatAddress(address)}</div>
            <div>extra text</div>
          </div>
        );
      }
    );

    setup({
      resourceType: 'Patient',
      name: 'foo',
      placeholder: 'Test',
      itemComponent: MyTestItemComponent,
      onChange: vi.fn(),
    });

    const input = screen.getByPlaceholderText('Test');
    await typeInAutocomplete(input, 'Simpson');

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
    expect(await screen.findByText('742 Evergreen Terrace, Springfield, IL, 12345')).toBeInTheDocument();
    expect((await screen.findAllByText('extra text'))?.[0]).toBeInTheDocument();
  });
});
