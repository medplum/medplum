// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, SortRule } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { SearchSortEditor } from './SearchSortEditor';

const medplum = new MockClient();

async function setup(search: SearchRequest): Promise<{ onChange: ReturnType<typeof vi.fn> }> {
  const onChange = vi.fn();
  await act(async () => {
    await medplum.requestSchema(search.resourceType);
  });
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <SearchSortEditor search={search} onChange={onChange} />
      </MedplumProvider>
    );
  });
  return { onChange };
}

async function openPopover(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByText('Sort'));
  });
  await screen.findByText('Add Sort');
}

function lastSortRules(onChange: ReturnType<typeof vi.fn>): SortRule[] | undefined {
  return (onChange.mock.calls.at(-1)?.[0] as SearchRequest).sortRules;
}

describe('SearchSortEditor', () => {
  test('Opens showing the default sort row', async () => {
    await setup({ resourceType: 'Patient' });
    await openPopover();
    expect(screen.getByLabelText('Sort 1 field', { selector: 'input' })).toHaveValue('_lastUpdated');
    expect(screen.getByLabelText('Sort 1 direction', { selector: 'input' })).toHaveValue('Newest to Oldest');
  });

  test.each<[SortRule[] | undefined, string | undefined]>([
    [undefined, undefined],
    [[{ code: '_lastUpdated', descending: true }], undefined],
    [[{ code: '_lastUpdated', descending: false }], '1 Sort Applied'],
    [
      [
        { code: 'birthdate', descending: true },
        { code: 'name', descending: false },
      ],
      '2 Sorts Applied',
    ],
  ])('Indicator and description for sort %j', async (sortRules, description) => {
    await setup({ resourceType: 'Patient', sortRules });
    const button = screen.getByRole('button', { name: 'Sort' });
    const indicator = document.querySelector('.mantine-Indicator-indicator');
    if (description) {
      expect(indicator).not.toBeNull();
      expect(button).toHaveAccessibleDescription(description);
    } else {
      expect(indicator).toBeNull();
      expect(button).not.toHaveAttribute('aria-describedby');
    }
  });

  test('Selecting a field in a new row emits the added sort rule', async () => {
    const { onChange } = await setup({ resourceType: 'Patient' });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByText('Add Sort'));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Sort 2 field', { selector: 'input' }));
    });
    await act(async () => {
      fireEvent.click((await screen.findAllByText('Birthdate')).at(-1) as HTMLElement);
    });
    expect(lastSortRules(onChange)).toMatchObject([
      { code: '_lastUpdated', descending: true },
      { code: 'birthdate', descending: false },
    ]);
  });

  test('Changing direction emits descending', async () => {
    const { onChange } = await setup({
      resourceType: 'Patient',
      sortRules: [{ code: 'birthdate', descending: false }],
    });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Sort 1 direction', { selector: 'input' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Newest to Oldest'));
    });
    expect(lastSortRules(onChange)).toMatchObject([{ code: 'birthdate', descending: true }]);
  });

  test('Removing the first rule keeps the next row showing its own field', async () => {
    const { onChange } = await setup({
      resourceType: 'Patient',
      sortRules: [
        { code: 'birthdate', descending: false },
        { code: 'name', descending: true },
      ],
    });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove sort 1'));
    });
    expect(lastSortRules(onChange)).toEqual([{ code: 'name', descending: true }]);
    expect(screen.getByLabelText('Sort 1 field', { selector: 'input' })).toHaveValue('Name');
    expect(screen.queryByLabelText('Sort 2 field', { selector: 'input' })).toBeNull();
  });

  test('Removing the only rule emits an empty sort', async () => {
    const { onChange } = await setup({
      resourceType: 'Patient',
      sortRules: [{ code: 'birthdate', descending: false }],
    });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove sort 1'));
    });
    expect(lastSortRules(onChange)).toEqual([]);
    expect(screen.getByText('No sort applied')).toBeInTheDocument();
  });
});
