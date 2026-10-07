// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { SearchColumnEditor } from './SearchColumnEditor';

const medplum = new MockClient();

interface Harness {
  readonly onChange: ReturnType<typeof vi.fn>;
  readonly rerender: (search: SearchRequest, defaultFields?: readonly string[]) => Promise<void>;
  readonly unmount: () => void;
}

async function setup(search: SearchRequest, defaultFields?: readonly string[]): Promise<Harness> {
  const onChange = vi.fn();
  const tree = (next: SearchRequest, nextDefaults?: readonly string[]): JSX.Element => (
    <MedplumProvider medplum={medplum}>
      <SearchColumnEditor search={next} defaultFields={nextDefaults} onChange={onChange} />
    </MedplumProvider>
  );
  await act(async () => {
    await medplum.requestSchema(search.resourceType);
  });
  const { rerender, unmount } = render(tree(search, defaultFields));
  return {
    onChange,
    unmount,
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

async function drag(column: string, target: string): Promise<void> {
  await act(async () => {
    fireEvent.pointerDown(screen.getByTestId(`column-grip-${column}`));
    fireEvent.pointerMove(screen.getByTestId(`column-${target}`));
    fireEvent.pointerUp(screen.getByTestId(`column-${target}`));
  });
}

function lastFields(onChange: ReturnType<typeof vi.fn>): string[] | undefined {
  return (onChange.mock.calls.at(-1)?.[0] as SearchRequest | undefined)?.fields;
}

describe('SearchColumnEditor', () => {
  describe('Column list', () => {
    test('Lists the visible columns checked first, then the rest of the universe unchecked', async () => {
      await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
      await openMenu();
      expect(screen.getByText('2 shown')).toBeInTheDocument();
      expect(screen.getByTestId('visible-name')).toBeInTheDocument();
      expect(screen.getByTestId('visible-birthDate')).toBeInTheDocument();
      expect(screen.getByTestId('column-gender')).toBeInTheDocument();
      expect(screen.queryByTestId('visible-gender')).toBeNull();
      expect(screen.getByTestId('column-_lastUpdated')).toBeInTheDocument();
    });

    test('Offers resource properties that have no search parameter', async () => {
      await setup({ resourceType: 'Patient', fields: ['name'] });
      await openMenu();
      expect(screen.getByTestId('column-photo')).toBeInTheDocument();
      expect(screen.getByTestId('column-maritalStatus')).toBeInTheDocument();
      expect(screen.getByTestId('column-meta')).toBeInTheDocument();
    });

    test('Offers a column once when a property and a search parameter share a name', async () => {
      await setup({ resourceType: 'Patient', fields: ['name'] });
      await openMenu();
      expect(screen.getByTestId('column-birthDate')).toBeInTheDocument();
      expect(screen.queryByTestId('column-birthdate')).toBeNull();
      expect(screen.getByTestId('column-id')).toBeInTheDocument();
      expect(screen.queryByTestId('column-_id')).toBeNull();
    });

    test('Still offers search parameters that are not properties', async () => {
      await setup({ resourceType: 'Patient', fields: ['name'] });
      await openMenu();
      expect(screen.getByTestId('column-phone')).toBeInTheDocument();
      expect(screen.getByTestId('column-_lastUpdated')).toBeInTheDocument();
    });

    test('A visible _id column does not add a second ID row', async () => {
      await setup({ resourceType: 'Patient', fields: ['_id', 'name'] });
      await openMenu();
      expect(screen.getByTestId('column-_id')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByTestId('column-id')).toBeNull();
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

    test('Rows are toggle buttons named by label with a pressed state', async () => {
      await setup({ resourceType: 'Patient', fields: ['name'] });
      await openMenu();
      const name = screen.getByTestId('column-name');
      expect(name.tagName).toBe('BUTTON');
      expect(name).toHaveAccessibleName('Name');
      expect(name).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('column-gender')).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('Toggling', () => {
    test('Clicking a row shows or hides the column and hidden rows stay listed', async () => {
      const { onChange, rerender } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
      await openMenu();

      await click(screen.getByTestId('column-gender'));
      expect(lastFields(onChange)).toEqual(['name', 'birthDate', 'gender']);
      await rerender({ resourceType: 'Patient', fields: ['name', 'birthDate', 'gender'] });

      await click(screen.getByTestId('column-birthDate'));
      expect(lastFields(onChange)).toEqual(['name', 'gender']);
      await rerender({ resourceType: 'Patient', fields: ['name', 'gender'] });

      expect(screen.getByTestId('column-birthDate')).toBeInTheDocument();
      expect(screen.queryByTestId('visible-birthDate')).toBeNull();
      expect(screen.getByText('2 shown')).toBeInTheDocument();
    });

    test('The last visible column cannot be hidden', async () => {
      const { onChange } = await setup({ resourceType: 'Patient', fields: ['name'] });
      await openMenu();
      await click(screen.getByTestId('column-name'));
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('visible-name')).toBeInTheDocument();
    });

    test('Empty fields shows no checked column, matching the empty table', async () => {
      const { onChange } = await setup({ resourceType: 'Patient', fields: [] });
      await openMenu();
      expect(screen.getByText('0 shown')).toBeInTheDocument();
      expect(document.querySelector('[data-testid^="visible-"]')).toBeNull();

      await click(screen.getByTestId('column-name'));
      expect(lastFields(onChange)).toEqual(['name']);
    });
  });

  describe('Reset Default', () => {
    test('Restores the given defaults, clears the search box and focuses it', async () => {
      const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] }, ['id', 'name']);
      await openMenu();
      const searchBox = screen.getByLabelText('Search columns');
      await act(async () => {
        fireEvent.change(searchBox, { target: { value: 'birth' } });
      });
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

    test('Falls back to the built-in defaults', async () => {
      const { onChange } = await setup({ resourceType: 'Patient', fields: ['name'] });
      await openMenu();
      await click(screen.getByText('Reset Default'));
      expect(lastFields(onChange)).toEqual(['id', '_lastUpdated']);
    });

    test('Is disabled while the columns already match the defaults in order', async () => {
      const { rerender } = await setup({ resourceType: 'Patient', fields: ['id', 'name'] }, ['id', 'name']);
      await openMenu();
      expect(screen.getByText('Reset Default').closest('button')).toBeDisabled();

      await rerender({ resourceType: 'Patient', fields: ['name', 'id'] });
      expect(screen.getByText('Reset Default').closest('button')).toBeEnabled();
    });
  });

  describe('Drag reorder', () => {
    test('Dragging a column up moves it before the target', async () => {
      const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate', 'gender'] });
      await openMenu();
      await drag('gender', 'name');
      expect(lastFields(onChange)).toEqual(['gender', 'name', 'birthDate']);
    });

    test('Dragging a column down moves it after the target and shows the guide below it', async () => {
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
    });

    test('Toggling right after a reorder takes a single click', async () => {
      const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate', 'gender'] });
      await openMenu();
      await drag('gender', 'name');
      const callsAfterDrag = onChange.mock.calls.length;

      await click(screen.getByTestId('column-birthDate'));
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

    test('Unmounting mid-drag removes the document listeners', async () => {
      const { onChange, unmount } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
      await openMenu();
      await act(async () => {
        fireEvent.pointerDown(screen.getByTestId('column-grip-name'));
        fireEvent.pointerMove(screen.getByTestId('column-birthDate'));
      });

      const removeSpy = vi.spyOn(document, 'removeEventListener');
      unmount();
      expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
      fireEvent(document, new Event('pointerup'));
      expect(onChange).not.toHaveBeenCalled();
      removeSpy.mockRestore();
    });
  });

  describe('Prop changes', () => {
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
});
