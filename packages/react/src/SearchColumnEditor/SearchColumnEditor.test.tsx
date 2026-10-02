// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { SearchColumnEditor } from './SearchColumnEditor';

const medplum = new MockClient();

async function setup(
  search: SearchRequest,
  onChange = vi.fn()
): Promise<{ onChange: ReturnType<typeof vi.fn>; rerender: (search: SearchRequest) => void }> {
  await act(async () => {
    await medplum.requestSchema('Patient');
    await medplum.requestSchema('Observation');
  });
  const wrap = (s: SearchRequest): JSX.Element => (
    <MedplumProvider medplum={medplum}>
      <SearchColumnEditor search={s} onChange={onChange} />
    </MedplumProvider>
  );
  const { rerender } = render(wrap(search));
  return { onChange, rerender: (s) => rerender(wrap(s)) };
}

async function openMenu(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByText('Columns'));
  });
  await screen.findByText('Reset Default');
}

function lastFields(onChange: ReturnType<typeof vi.fn>): string[] | undefined {
  return (onChange.mock.calls.at(-1)?.[0] as SearchRequest).fields;
}

describe('SearchColumnEditor', () => {
  test('Lists the visible columns first, then the rest of the fields and metadata', async () => {
    await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();
    expect(screen.getByText('2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('visible-name')).toBeInTheDocument();
    expect(screen.getByTestId('visible-birthDate')).toBeInTheDocument();
    expect(screen.getByTestId('column-gender')).toBeInTheDocument();
    expect(screen.queryByTestId('visible-gender')).toBeNull();
    expect(screen.getByTestId('column-_lastUpdated')).toBeInTheDocument();
  });

  test('Search box filters the column list by label', async () => {
    await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search columns'), { target: { value: 'birth' } });
    });
    expect(screen.getByTestId('column-birthDate')).toBeInTheDocument();
    expect(screen.queryByTestId('column-name')).toBeNull();
  });

  test('Showing an available column adds it to the fields', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name'] });
    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByTestId('column-gender'));
    });
    expect(lastFields(onChange)).toEqual(['name', 'gender']);
  });

  test('A hidden column stays in the list without a check', async () => {
    const { rerender } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByTestId('column-birthDate'));
    });
    rerender({ resourceType: 'Patient', fields: ['name'] });
    expect(screen.getByTestId('column-birthDate')).toBeInTheDocument();
    expect(screen.queryByTestId('visible-birthDate')).toBeNull();
    expect(screen.getByText('1 shown')).toBeInTheDocument();
  });

  test('Reset default restores the original fields, clears the search and focuses the search box', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();
    const searchBox = screen.getByLabelText('Search columns');
    await act(async () => {
      fireEvent.change(searchBox, { target: { value: 'birth' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('column-birthDate'));
    });
    const resetButton = screen.getByText('Reset Default');
    await act(async () => {
      resetButton.closest('button')?.focus();
      fireEvent.click(resetButton);
    });
    expect(lastFields(onChange)).toEqual(['name', 'birthDate']);
    expect(searchBox).toHaveValue('');
    expect(searchBox).toHaveFocus();
    expect(screen.getByTestId('column-name')).toBeInTheDocument();
  });

  test('Column rows are toggle buttons that Alt+Down / Alt+Up reorder, keeping focus and announcing', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate', 'gender'] });
    await openMenu();
    const name = screen.getByTestId('column-name');
    expect(name.tagName).toBe('BUTTON');
    expect(name).toHaveAccessibleName('Name');
    expect(name).toHaveAttribute('aria-pressed', 'true');
    expect(name).toHaveAccessibleDescription('Press Alt+Up or Alt+Down to reorder');

    await act(async () => {
      name.focus();
      fireEvent.keyDown(name, { key: 'ArrowDown' });
      fireEvent.keyDown(name, { key: 'ArrowUp', altKey: true });
    });
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.keyDown(name, { key: 'ArrowDown', altKey: true });
    });
    expect(lastFields(onChange)).toEqual(['birthDate', 'name', 'gender']);
    expect(screen.getByTestId('column-name')).toHaveFocus();
    expect(screen.getByText(/Name moved to position 2 of/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('column-name'), { key: 'ArrowUp', altKey: true });
    });
    expect(lastFields(onChange)).toEqual(['name', 'birthDate', 'gender']);
  });

  test('Keyboard reorder moves past columns hidden by the search box', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['birthDate', 'name', 'deathDate'] });
    await openMenu();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search columns'), { target: { value: 'date' } });
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('column-birthDate'), { key: 'ArrowDown', altKey: true });
    });
    expect(lastFields(onChange)).toEqual(['name', 'deathDate', 'birthDate']);
  });

  test('Dragging a column reorders the fields, shows the guide, and leaves toggling at a single click', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate', 'gender'] });
    await openMenu();
    const gender = screen.getByTestId('column-gender');
    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('column-grip-name'));
      fireEvent.pointerMove(gender);
    });
    expect(gender.className).toContain('dragOverBelow');
    await act(async () => {
      fireEvent.pointerUp(gender);
    });
    expect(lastFields(onChange)).toEqual(['birthDate', 'gender', 'name']);

    const callsAfterDrag = onChange.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByTestId('column-birthDate'));
    });
    expect(onChange.mock.calls.length).toBe(callsAfterDrag + 1);
    expect(lastFields(onChange)).toEqual(['gender', 'name']);
  });

  test('A cancelled drag ends without reordering', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate', 'gender'] });
    await openMenu();
    const name = screen.getByTestId('column-name');
    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('column-grip-gender'));
      fireEvent.pointerMove(name);
      fireEvent(document, new Event('pointercancel'));
    });
    expect(name.className).not.toContain('dragOver');
    await act(async () => {
      fireEvent.pointerUp(name);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  test('The last visible column cannot be hidden', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name'] });
    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByTestId('column-name'));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('visible-name')).toBeInTheDocument();
  });

  test('Changing the resource type rebuilds the column list and reset default', async () => {
    const { onChange, rerender } = await setup({ resourceType: 'Patient', fields: ['name'] });
    rerender({ resourceType: 'Observation', fields: ['code'] });
    await openMenu();
    expect(screen.getByTestId('column-code')).toBeInTheDocument();
    expect(screen.queryByTestId('column-gender')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByText('Reset Default'));
    });
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ resourceType: 'Observation', fields: ['code'] });
  });
});
