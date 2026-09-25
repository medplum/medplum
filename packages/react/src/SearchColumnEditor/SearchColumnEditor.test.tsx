// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { SearchColumnEditor } from './SearchColumnEditor';

const medplum = new MockClient();

async function setup(search: SearchRequest, onChange = vi.fn()): Promise<{ onChange: ReturnType<typeof vi.fn> }> {
  await act(async () => {
    await medplum.requestSchema(search.resourceType);
  });
  render(
    <MedplumProvider medplum={medplum}>
      <SearchColumnEditor search={search} onChange={onChange} />
    </MedplumProvider>
  );
  return { onChange };
}

async function openMenu(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByText('Columns'));
  });
  await screen.findByText('Reset Default');
}

describe('SearchColumnEditor', () => {
  test('Lists the visible columns first and marks them visible', async () => {
    await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();
    expect(screen.getByText('2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('column-name')).toBeInTheDocument();
    expect(screen.getByTestId('column-birthDate')).toBeInTheDocument();
    expect(screen.getByTestId('visible-name')).toBeInTheDocument();
    expect(screen.getByTestId('visible-birthDate')).toBeInTheDocument();
  });

  test('Search box filters the column list by label', async () => {
    await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();
    expect(screen.getByTestId('column-name')).toBeInTheDocument();
    expect(screen.getByTestId('column-birthDate')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search columns'), { target: { value: 'birth' } });
    });

    expect(screen.getByTestId('column-birthDate')).toBeInTheDocument();
    expect(screen.queryByTestId('column-name')).toBeNull();
  });

  test('Offers the full field and metadata universe, not just current columns', async () => {
    await setup({ resourceType: 'Patient', fields: ['name'] });
    await openMenu();
    expect(screen.getByTestId('column-gender')).toBeInTheDocument();
    expect(screen.queryByTestId('visible-gender')).toBeNull();
    expect(screen.getByTestId('column-_lastUpdated')).toBeInTheDocument();
  });

  test('Showing an available column adds it to the fields', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name'] });
    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByTestId('column-gender'));
    });
    const last = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(last.fields).toContain('name');
    expect(last.fields).toContain('gender');
  });

  test('Toggling a column hides it and emits fields', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByTestId('column-name'));
    });
    const last = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(last.fields).toEqual(['birthDate']);
  });

  test('Hidden column stays in the list without a check', async () => {
    await act(async () => {
      await medplum.requestSchema('Patient');
    });
    let search: SearchRequest = { resourceType: 'Patient', fields: ['name', 'birthDate'] };
    const onChange = vi.fn((s: SearchRequest) => {
      search = s;
    });
    const { rerender } = render(
      <MedplumProvider medplum={medplum}>
        <SearchColumnEditor search={search} onChange={onChange} />
      </MedplumProvider>
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Columns'));
    });
    await screen.findByText('Reset Default');
    await act(async () => {
      fireEvent.click(screen.getByTestId('column-birthDate'));
    });
    rerender(
      <MedplumProvider medplum={medplum}>
        <SearchColumnEditor search={search} onChange={onChange} />
      </MedplumProvider>
    );
    expect(screen.getByTestId('column-birthDate')).toBeInTheDocument();
    expect(screen.queryByTestId('visible-birthDate')).toBeNull();
    expect(screen.getByText('1 shown')).toBeInTheDocument();
  });

  test('Reset default restores the original fields', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByTestId('column-name'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Reset Default'));
    });
    const last = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(last.fields).toEqual(['name', 'birthDate']);
  });

  test('Reset default clears the search and focuses the search box', async () => {
    await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
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
    expect(searchBox).toHaveValue('');
    expect(searchBox).toHaveFocus();
    expect(screen.getByTestId('column-name')).toBeInTheDocument();
  });

  test('Dragging a column reorders the emitted fields', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate', 'gender'] });
    await openMenu();

    const name = screen.getByTestId('column-name');
    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('column-grip-gender'));
      fireEvent.pointerMove(name);
      fireEvent.pointerUp(name);
    });

    const last = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(last.fields).toEqual(['gender', 'name', 'birthDate']);
  });

  test('Column rows are toggle buttons named by label with a pressed state', async () => {
    await setup({ resourceType: 'Patient', fields: ['name'] });
    await openMenu();
    const name = screen.getByTestId('column-name');
    expect(name.tagName).toBe('BUTTON');
    expect(name).toHaveAccessibleName('Name');
    expect(name).toHaveAttribute('aria-pressed', 'true');
    expect(name).toHaveAccessibleDescription('Press Alt+Up or Alt+Down to reorder');
    expect(screen.getByTestId('column-gender')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Alt+Down and Alt+Up reorder a column, keep focus and announce the move', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate', 'gender'] });
    await openMenu();

    const name = screen.getByTestId('column-name');
    await act(async () => {
      name.focus();
      fireEvent.keyDown(name, { key: 'ArrowDown', altKey: true });
    });
    expect((onChange.mock.calls.at(-1)?.[0] as SearchRequest).fields).toEqual(['birthDate', 'name', 'gender']);
    expect(screen.getByTestId('column-name')).toHaveFocus();
    expect(screen.getByText(/Name moved to position 2 of/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('column-name'), { key: 'ArrowUp', altKey: true });
    });
    expect((onChange.mock.calls.at(-1)?.[0] as SearchRequest).fields).toEqual(['name', 'birthDate', 'gender']);
    expect(screen.getByText(/Name moved to position 1 of/)).toBeInTheDocument();
  });

  test('Keyboard reorder ignores plain arrows and stops at the ends of the list', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('column-name'), { key: 'ArrowDown' });
      fireEvent.keyDown(screen.getByTestId('column-name'), { key: 'ArrowUp', altKey: true });
    });
    expect(onChange).not.toHaveBeenCalled();
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
    expect((onChange.mock.calls.at(-1)?.[0] as SearchRequest).fields).toEqual(['name', 'deathDate', 'birthDate']);
  });

  test('Toggling right after a reorder takes a single click', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate', 'gender'] });
    await openMenu();

    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('column-grip-gender'));
      fireEvent.pointerMove(screen.getByTestId('column-name'));
      fireEvent.pointerUp(screen.getByTestId('column-name'));
    });
    const callsAfterDrag = onChange.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByTestId('column-birthDate'));
    });

    expect(onChange.mock.calls.length).toBe(callsAfterDrag + 1);
    const last = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(last.fields).not.toContain('birthDate');
  });

  test('Dragging down moves the column after the target and shows the guide below it', async () => {
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
    const last = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(last.fields).toEqual(['birthDate', 'gender', 'name']);
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
    await act(async () => {
      await medplum.requestSchema('Patient');
    });
    const onChange = vi.fn();
    const { unmount } = render(
      <MedplumProvider medplum={medplum}>
        <SearchColumnEditor search={{ resourceType: 'Patient', fields: ['name', 'birthDate'] }} onChange={onChange} />
      </MedplumProvider>
    );
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
    await act(async () => {
      await medplum.requestSchema('Patient');
      await medplum.requestSchema('Observation');
    });
    const onChange = vi.fn();
    const { rerender } = render(
      <MedplumProvider medplum={medplum}>
        <SearchColumnEditor search={{ resourceType: 'Patient', fields: ['name'] }} onChange={onChange} />
      </MedplumProvider>
    );
    rerender(
      <MedplumProvider medplum={medplum}>
        <SearchColumnEditor search={{ resourceType: 'Observation', fields: ['code'] }} onChange={onChange} />
      </MedplumProvider>
    );
    await openMenu();
    expect(screen.getByTestId('column-code')).toBeInTheDocument();
    expect(screen.queryByTestId('column-gender')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByText('Reset Default'));
    });
    const last = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(last).toMatchObject({ resourceType: 'Observation', fields: ['code'] });
  });
});
