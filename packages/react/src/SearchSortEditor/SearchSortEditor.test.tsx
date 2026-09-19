// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { SearchSortEditor } from './SearchSortEditor';

const medplum = new MockClient();

async function setup(search: SearchRequest, onChange = vi.fn()): Promise<{ onChange: ReturnType<typeof vi.fn> }> {
  await act(async () => {
    await medplum.requestSchema(search.resourceType);
  });
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>{<SearchSortEditor search={search} onChange={onChange} />}</MedplumProvider>
    );
  });
  return { onChange };
}

async function openPopover(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByText('Sort'));
  });
  await screen.findByText('Add another sort');
}

describe('SearchSortEditor', () => {
  test('Renders trigger and opens', async () => {
    await setup({ resourceType: 'Patient' });
    await openPopover();
    expect(screen.getByText('No sort applied')).toBeInTheDocument();
    expect(screen.getByText('Add another sort')).toBeInTheDocument();
  });

  test('Shows an existing sort rule with its direction', async () => {
    await setup({ resourceType: 'Patient', sortRules: [{ code: 'birthdate', descending: true }] });
    await openPopover();
    expect(screen.getByLabelText('sort-0-field', { selector: 'input' })).toHaveValue('Birthdate');
    expect(screen.getByLabelText('sort-0-direction', { selector: 'input' })).toHaveValue('Newest → Oldest');
  });

  test('Add another sort adds an empty row', async () => {
    await setup({ resourceType: 'Patient' });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByText('Add another sort'));
    });
    expect(screen.getByLabelText('sort-0-field', { selector: 'input' })).toBeInTheDocument();
  });

  test('Selecting a field emits a sort rule', async () => {
    const { onChange } = await setup({ resourceType: 'Patient' });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByText('Add another sort'));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('sort-0-field', { selector: 'input' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Birthdate'));
    });
    const lastArg = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(lastArg.sortRules).toMatchObject([{ code: 'birthdate', descending: false }]);
  });

  test('Changing direction emits descending', async () => {
    const { onChange } = await setup({
      resourceType: 'Patient',
      sortRules: [{ code: 'birthdate', descending: false }],
    });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('sort-0-direction', { selector: 'input' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Newest → Oldest'));
    });
    const lastArg = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(lastArg.sortRules).toMatchObject([{ code: 'birthdate', descending: true }]);
  });

  test('Delete removes the sort rule', async () => {
    const { onChange } = await setup({
      resourceType: 'Patient',
      sortRules: [{ code: 'birthdate', descending: false }],
    });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('delete-sort-0'));
    });
    const lastArg = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(lastArg.sortRules ?? []).toHaveLength(0);
  });
});
