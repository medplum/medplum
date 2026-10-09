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
  defaultFields?: readonly string[]
): Promise<{
  onChange: ReturnType<typeof vi.fn>;
  rerender: (search: SearchRequest, defaultFields?: readonly string[]) => Promise<void>;
}> {
  const onChange = vi.fn();
  const tree = (next: SearchRequest, nextDefaults?: readonly string[]): JSX.Element => (
    <MedplumProvider medplum={medplum}>
      <SearchColumnEditor search={next} defaultFields={nextDefaults} onChange={onChange} />
    </MedplumProvider>
  );
  await act(async () => {
    await medplum.requestSchema(search.resourceType);
  });
  const { rerender } = render(tree(search, defaultFields));
  return {
    onChange,
    rerender: async (next, nextDefaults = defaultFields) => {
      await act(async () => {
        await medplum.requestSchema(next.resourceType);
      });
      rerender(tree(next, nextDefaults));
    },
  };
}

async function openMenu(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByText('Columns'));
  });
  await screen.findByText('Reset Default');
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

function lastFields(onChange: ReturnType<typeof vi.fn>): string[] | undefined {
  return (onChange.mock.calls.at(-1)?.[0] as SearchRequest | undefined)?.fields;
}

describe('SearchColumnEditor', () => {
  test('Lists visible columns as pressed toggle buttons, then the rest unpressed, each once', async () => {
    await setup({ resourceType: 'Patient', fields: ['_id', 'name'] });
    await openMenu();
    expect(screen.getByText('2 shown')).toBeInTheDocument();
    const name = screen.getByTestId('column-name');
    expect(name.tagName).toBe('BUTTON');
    expect(name).toHaveAccessibleName('Name');
    expect(name).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('column-_id')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('column-id')).toBeNull();
    expect(screen.getByTestId('column-gender')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('column-_lastUpdated')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Clicking rows shows and hides columns, never hides the last one, and keeps hidden rows listed', async () => {
    const { onChange, rerender } = await setup({ resourceType: 'Patient', fields: [] });
    await openMenu();
    expect(screen.getByText('0 shown')).toBeInTheDocument();

    await click(screen.getByTestId('column-name'));
    expect(lastFields(onChange)).toEqual(['name']);
    await rerender({ resourceType: 'Patient', fields: ['name'] });

    await click(screen.getByTestId('column-name'));
    expect(onChange).toHaveBeenCalledTimes(1);

    await click(screen.getByTestId('column-gender'));
    expect(lastFields(onChange)).toEqual(['gender', 'name']);
    await rerender({ resourceType: 'Patient', fields: ['gender', 'name'] });

    await click(screen.getByTestId('column-name'));
    expect(lastFields(onChange)).toEqual(['gender']);
    await rerender({ resourceType: 'Patient', fields: ['gender'] });
    expect(screen.getByTestId('column-name')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('1 shown')).toBeInTheDocument();
  });

  test('Reset Default restores the given defaults, clears the search box and focuses it', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] }, ['id', 'name']);
    await openMenu();
    const searchBox = screen.getByLabelText('Search columns');
    await act(async () => {
      fireEvent.change(searchBox, { target: { value: 'birth' } });
    });
    expect(screen.getByTestId('column-birthDate')).toBeInTheDocument();
    expect(screen.queryByTestId('column-name')).toBeNull();

    const resetButton = screen.getByText('Reset Default');
    await act(async () => {
      resetButton.closest('button')?.focus();
      fireEvent.click(resetButton);
    });
    expect(lastFields(onChange)).toEqual(['id', 'name']);
    expect(searchBox).toHaveValue('');
    expect(searchBox).toHaveFocus();
    expect(screen.getByTestId('column-name')).toBeInTheDocument();
  });

  test('Reset Default falls back to the built-in defaults and is disabled while they match in order', async () => {
    const { onChange, rerender } = await setup({ resourceType: 'Patient', fields: ['id', '_lastUpdated'] });
    await openMenu();
    expect(screen.getByText('Reset Default').closest('button')).toBeDisabled();

    await rerender({ resourceType: 'Patient', fields: ['_lastUpdated', 'id'] });
    expect(screen.getByText('Reset Default').closest('button')).toBeEnabled();

    await click(screen.getByText('Reset Default'));
    expect(lastFields(onChange)).toEqual(['id', '_lastUpdated']);
  });

  test('Dragging reorders the columns, shows the drop guide, and leaves rows clickable', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate', 'gender'] });
    await openMenu();

    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('column-grip-gender'));
      fireEvent.pointerMove(screen.getByTestId('column-name'));
      fireEvent.pointerUp(screen.getByTestId('column-name'));
    });
    expect(lastFields(onChange)).toEqual(['gender', 'name', 'birthDate']);

    const birthDate = screen.getByTestId('column-birthDate');
    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('column-grip-gender'));
      fireEvent.pointerMove(birthDate);
    });
    expect(birthDate.className).toContain('dragOverBelow');
    await act(async () => {
      fireEvent.pointerUp(birthDate);
    });
    expect(lastFields(onChange)).toEqual(['name', 'birthDate', 'gender']);

    const callsAfterDrag = onChange.mock.calls.length;
    await click(birthDate);
    expect(onChange.mock.calls.length).toBe(callsAfterDrag + 1);
    expect(lastFields(onChange)).toEqual(['name', 'gender']);
  });

  test('Changing the resource type rebuilds the column list and reset default', async () => {
    const { onChange, rerender } = await setup({ resourceType: 'Patient', fields: ['name'] });
    await rerender({ resourceType: 'Observation', fields: ['code'] }, ['code', 'status']);
    await openMenu();
    expect(screen.getByTestId('column-code')).toBeInTheDocument();
    expect(screen.queryByTestId('column-gender')).toBeNull();

    await click(screen.getByText('Reset Default'));
    expect(onChange).toHaveBeenLastCalledWith({ resourceType: 'Observation', fields: ['code', 'status'] });
  });

  test('Reopening after the fields change externally keeps the new column order', async () => {
    const { onChange, rerender } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();
    await click(screen.getByText('Columns'));
    await rerender({ resourceType: 'Patient', fields: ['birthDate', 'name'] });
    await openMenu();

    await click(screen.getByTestId('column-gender'));
    expect(lastFields(onChange)).toEqual(['birthDate', 'name', 'gender']);
  });
});
