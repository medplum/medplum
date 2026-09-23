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
  await screen.findByText('Reset default');
}

describe('SearchColumnEditor', () => {
  test('Lists the visible columns first and marks them visible', async () => {
    await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();
    expect(screen.getByText('2 shown')).toBeInTheDocument();
    expect(screen.getByLabelText('column-name')).toBeInTheDocument();
    expect(screen.getByLabelText('column-birthDate')).toBeInTheDocument();
    expect(screen.getByLabelText('visible-name')).toBeInTheDocument();
    expect(screen.getByLabelText('visible-birthDate')).toBeInTheDocument();
  });

  test('Search box filters the column list by label', async () => {
    await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();
    expect(screen.getByLabelText('column-name')).toBeInTheDocument();
    expect(screen.getByLabelText('column-birthDate')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search columns'), { target: { value: 'birth' } });
    });

    expect(screen.getByLabelText('column-birthDate')).toBeInTheDocument();
    expect(screen.queryByLabelText('column-name')).toBeNull();
  });

  test('Offers the full field and metadata universe, not just current columns', async () => {
    await setup({ resourceType: 'Patient', fields: ['name'] });
    await openMenu();
    expect(screen.getByLabelText('column-gender')).toBeInTheDocument();
    expect(screen.queryByLabelText('visible-gender')).toBeNull();
    expect(screen.getByLabelText('column-_lastUpdated')).toBeInTheDocument();
  });

  test('Showing an available column adds it to the fields', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name'] });
    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('column-gender'));
    });
    const last = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(last.fields).toContain('name');
    expect(last.fields).toContain('gender');
  });

  test('Toggling a column hides it and emits fields', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('column-name'));
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
    await screen.findByText('Reset default');
    await act(async () => {
      fireEvent.click(screen.getByLabelText('column-birthDate'));
    });
    rerender(
      <MedplumProvider medplum={medplum}>
        <SearchColumnEditor search={search} onChange={onChange} />
      </MedplumProvider>
    );
    expect(screen.getByLabelText('column-birthDate')).toBeInTheDocument();
    expect(screen.queryByLabelText('visible-birthDate')).toBeNull();
    expect(screen.getByText('1 shown')).toBeInTheDocument();
  });

  test('Reset default restores the original fields', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate'] });
    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('column-name'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Reset default'));
    });
    const last = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(last.fields).toEqual(['name', 'birthDate']);
  });

  test('Dragging a column reorders the emitted fields', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate', 'gender'] });
    await openMenu();

    // Drag "gender" (index 2) onto "name" (index 0): gender moves to the front.
    const name = screen.getByLabelText('column-name');
    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('column-grip-gender'));
      fireEvent.pointerMove(name);
      fireEvent.pointerUp(name);
    });

    const last = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(last.fields).toEqual(['gender', 'name', 'birthDate']);
  });

  test('Toggling right after a reorder takes a single click', async () => {
    const { onChange } = await setup({ resourceType: 'Patient', fields: ['name', 'birthDate', 'gender'] });
    await openMenu();

    // Reorder, then immediately toggle a column with one click - no drag guard should swallow it.
    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('column-grip-gender'));
      fireEvent.pointerMove(screen.getByLabelText('column-name'));
      fireEvent.pointerUp(screen.getByLabelText('column-name'));
    });
    const callsAfterDrag = onChange.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByLabelText('column-birthDate'));
    });

    expect(onChange.mock.calls.length).toBe(callsAfterDrag + 1);
    const last = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(last.fields).not.toContain('birthDate');
  });
});
