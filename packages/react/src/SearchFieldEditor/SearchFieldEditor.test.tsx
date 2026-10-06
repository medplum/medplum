// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { SearchFieldEditor } from './SearchFieldEditor';

async function openFieldOptions(fields: string[]): Promise<void> {
  render(
    <SearchFieldEditor search={{ resourceType: 'Patient', fields }} visible={true} onOk={vi.fn()} onCancel={vi.fn()} />
  );
  await act(async () => {
    fireEvent.focus(screen.getByPlaceholderText('Select fields to display'));
  });
  await screen.findByRole('option', { name: 'Name', hidden: true });
}

function option(name: string): HTMLElement | null {
  return screen.queryByRole('option', { name, hidden: true });
}

describe('SearchFieldEditor', () => {
  beforeAll(async () => {
    await new MockClient().requestSchema('Patient');
  });

  test('Render not visible', () => {
    const currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['name'],
    };

    render(<SearchFieldEditor search={currSearch} visible={false} onOk={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByText('OK')).toBeNull();
  });

  test('Modal onClose not called when overlay clicked while dropdown open', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: [],
    };
    const onCancel = vi.fn();

    render(<SearchFieldEditor search={currSearch} visible={true} onOk={(e) => (currSearch = e)} onCancel={onCancel} />);

    // opens the dropdown
    await act(async () => {
      fireEvent.focus(screen.getByPlaceholderText('Select fields to display'));
    });

    // click the overlay
    await act(async () => {
      fireEvent.mouseDown(screen.getByTestId('overlay-child'));
      fireEvent.mouseUp(screen.getByTestId('overlay-child'));
      fireEvent.click(screen.getByTestId('overlay-child'));
    });

    expect(onCancel).not.toHaveBeenCalled();
  });

  test('Modal onClose called when overlay clicked while dropdown NOT open', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: [],
    };
    const onCancel = vi.fn();

    render(<SearchFieldEditor search={currSearch} visible={true} onOk={(e) => (currSearch = e)} onCancel={onCancel} />);

    // click the overlay
    await act(async () => {
      fireEvent.mouseDown(screen.getByTestId('overlay-child'));
      fireEvent.mouseUp(screen.getByTestId('overlay-child'));
      fireEvent.click(screen.getByTestId('overlay-child'));
    });

    expect(onCancel).toHaveBeenCalled();
  });

  test('Offers resource properties that have no search parameter', async () => {
    await openFieldOptions(['name']);
    expect(option('Photo')).toBeInTheDocument();
    expect(option('Marital Status')).toBeInTheDocument();
    expect(option('Meta')).toBeInTheDocument();
  });

  test('Offers a property once, even when a search parameter shares its name', async () => {
    await openFieldOptions(['name']);
    expect(option('Birth Date')).toBeInTheDocument();
    expect(option('Birthdate')).toBeNull();
    expect(screen.getAllByRole('option', { name: 'ID', hidden: true })).toHaveLength(1);
  });

  test('Still offers search parameters that are not properties', async () => {
    await openFieldOptions(['name']);
    expect(option('Last Updated')).toBeInTheDocument();
    expect(option('Phone')).toBeInTheDocument();
  });
});
