// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Menu } from '@mantine/core';
import type { SearchRequest, SortRule } from '@medplum/core';
import { globalSchema, Operator } from '@medplum/core';
import type { SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { addThisMonthFilter, addYearToDateFilter } from '../SearchControl/SearchUtils';
import { act, fireEvent, render, screen, userEvent } from '../test-utils/render';
import type { SearchPopupMenuProps } from './SearchPopupMenu';
import { SearchPopupMenu } from './SearchPopupMenu';

const medplum = new MockClient();

function param(resourceType: string, code: string): SearchParameter {
  return globalSchema.types[resourceType].searchParams?.[code] as SearchParameter;
}

const nameAndGenderFilters: SearchRequest = {
  resourceType: 'Patient',
  filters: [
    { code: 'name', operator: Operator.CONTAINS, value: 'Sim' },
    { code: 'name', operator: Operator.NOT, value: 'Bart' },
    { code: 'gender', operator: Operator.EQUALS, value: 'male' },
  ],
};

describe('SearchPopupMenu', () => {
  beforeAll(async () => {
    await medplum.requestSchema('Patient');
    await medplum.requestSchema('Observation');
  });

  async function setup(partialProps: Partial<SearchPopupMenuProps>): Promise<{ current: () => SearchRequest }> {
    let current = partialProps.search ?? { resourceType: 'Patient' };
    const props: SearchPopupMenuProps = {
      search: current,
      searchParams: partialProps.searchParams,
      onChange: (e) => (current = e),
      onFilterByColumn: partialProps.onFilterByColumn,
    };

    render(
      <MedplumProvider medplum={medplum}>
        <Menu closeOnItemClick={false}>
          <Menu.Target>
            <Button>Toggle menu</Button>
          </Menu.Target>
          <SearchPopupMenu {...props} />
        </Menu>
      </MedplumProvider>
    );

    await userEvent.click(await screen.findByText('Toggle menu'));
    return { current: () => current };
  }

  function menuLabels(): (string | null)[] {
    return screen.getAllByRole('menuitem', { hidden: true }).map((el) => el.textContent);
  }

  function hasCheck(label: string): boolean {
    const item = screen.getByText(label).closest('[role=menuitem]') as HTMLElement;
    return !!item.querySelector('.tabler-icon-check');
  }

  test('Renders nothing without a search parameter', async () => {
    await setup({ searchParams: undefined });
    expect(screen.queryByText('Sort A to Z')).not.toBeInTheDocument();
  });

  test('Only shows the two sort options - no filter controls', async () => {
    await setup({ searchParams: [param('Patient', 'name')] });
    expect(await screen.findByText('Sort A to Z')).toBeInTheDocument();
    expect(menuLabels()).toEqual(['Sort A to Z', 'Sort Z to A']);
  });

  test.each<[string[], string, SortRule]>([
    [['birthdate'], 'Sort Oldest to Newest', { code: 'birthdate', descending: false }],
    [['birthdate'], 'Sort Newest to Oldest', { code: 'birthdate', descending: true }],
    [['organization'], 'Sort A to Z', { code: 'organization', descending: false }],
    [['gender'], 'Sort Z to A', { code: 'gender', descending: true }],
    [['name', 'given'], 'Sort A to Z', { code: 'name', descending: false }],
  ])('Sorting %j by "%s" sets the sort rule', async (codes, label, expected) => {
    const { current } = await setup({ searchParams: codes.map((code) => param('Patient', code)) });
    await act(async () => {
      fireEvent.click(await screen.findByText(label));
    });
    expect(current().sortRules).toMatchObject([expected]);
  });

  test('Quantity sort uses smallest/largest labels', async () => {
    await setup({ searchParams: [param('Observation', 'value-quantity')] });
    expect(await screen.findByText('Sort Smallest to Largest')).toBeInTheDocument();
    expect(screen.getByText('Sort Largest to Smallest')).toBeInTheDocument();
  });

  test('Date columns offer relative dates above "Filter by this column"', async () => {
    await setup({ searchParams: [param('Patient', 'birthdate')], onFilterByColumn: vi.fn() });
    await screen.findByText('Sort Oldest to Newest');
    expect(menuLabels()).toEqual([
      'Sort Oldest to Newest',
      'Sort Newest to Oldest',
      'Tomorrow',
      'Today',
      'Yesterday',
      'Next Month',
      'This Month',
      'Last Month',
      'Year to date',
      'Filter by this column',
    ]);
  });

  test.each(['_lastUpdated', 'death-date'])('Past-only date %s hides future options', async (code) => {
    const searchParam = param('Patient', code) ?? param('Resource', code);
    await setup({ searchParams: [searchParam] });
    await screen.findByText('Sort Oldest to Newest');
    expect(menuLabels()).toEqual([
      'Sort Oldest to Newest',
      'Sort Newest to Oldest',
      'Today',
      'Yesterday',
      'This Month',
      'Last Month',
      'Year to date',
    ]);
  });

  test('A relative date adds a start/end filter pair', async () => {
    const { current } = await setup({ searchParams: [param('Patient', 'birthdate')] });
    await act(async () => {
      fireEvent.click(await screen.findByText('Today'));
    });
    expect(current().filters).toMatchObject([
      { code: 'birthdate', operator: Operator.GREATER_THAN_OR_EQUALS },
      { code: 'birthdate', operator: Operator.LESS_THAN_OR_EQUALS },
    ]);
  });

  test.each<[string, SearchRequest | undefined, string, boolean, string[]]>([
    [
      'column without filters',
      { resourceType: 'Patient', filters: [{ code: 'gender', operator: Operator.EQUALS, value: 'male' }] },
      'name',
      true,
      ['Filter by this column'],
    ],
    [
      'filtered non-date column',
      nameAndGenderFilters,
      'name',
      true,
      ['Filter by this column', 'Clear all column filters'],
    ],
    ['unfiltered date column', undefined, 'birthdate', true, ['Filter by this column']],
    [
      'filtered date column',
      addThisMonthFilter({ resourceType: 'Patient' }, 'birthdate'),
      'birthdate',
      true,
      ['Clear all column filters'],
    ],
    ['no onFilterByColumn callback', nameAndGenderFilters, 'name', false, ['Clear all column filters']],
  ])('Trailing items for a %s', async (_, search, code, withCallback, expected) => {
    await setup({
      search,
      searchParams: [param('Patient', code)],
      onFilterByColumn: withCallback ? vi.fn() : undefined,
    });
    await screen.findAllByText(/^Sort /);
    const trailing = menuLabels().filter((l) => l === 'Filter by this column' || l === 'Clear all column filters');
    expect(trailing).toEqual(expected);
  });

  test('"Clear all column filters" clears only that column', async () => {
    const { current } = await setup({ search: nameAndGenderFilters, searchParams: [param('Patient', 'name')] });
    await act(async () => {
      fireEvent.click(await screen.findByText('Clear all column filters'));
    });
    expect(current().filters).toEqual([{ code: 'gender', operator: Operator.EQUALS, value: 'male' }]);
  });

  test('"Filter by this column" invokes the callback with the search parameter', async () => {
    const onFilterByColumn = vi.fn();
    await setup({ searchParams: [param('Patient', 'name')], onFilterByColumn });
    await act(async () => {
      fireEvent.click(await screen.findByText('Filter by this column'));
    });
    expect(onFilterByColumn).toHaveBeenCalledWith(expect.objectContaining({ code: 'name' }));
  });

  test('The active sort direction shows a check', async () => {
    await setup({
      search: { resourceType: 'Patient', sortRules: [{ code: 'name', descending: true }] },
      searchParams: [param('Patient', 'name')],
    });
    await screen.findByText('Sort A to Z');
    expect(hasCheck('Sort Z to A')).toBe(true);
    expect(hasCheck('Sort A to Z')).toBe(false);
  });

  test('The active relative date shows a check', async () => {
    const search = addThisMonthFilter({ resourceType: 'Patient' }, 'birthdate');
    await setup({ search, searchParams: [param('Patient', 'birthdate')] });
    await screen.findByText('This Month');
    expect(hasCheck('This Month')).toBe(true);
    expect(hasCheck('Today')).toBe(false);
    expect(hasCheck('Last Month')).toBe(false);
  });

  test('Year to date shows a check even though its end time has moved on', async () => {
    const search = addYearToDateFilter({ resourceType: 'Patient' }, 'birthdate');
    const filters = search.filters ?? [];
    filters[1] = { ...filters[1], value: new Date(Date.now() - 60_000).toISOString() };
    await setup({ search: { ...search, filters }, searchParams: [param('Patient', 'birthdate')] });
    await screen.findByText('Year to date');
    expect(hasCheck('Year to date')).toBe(true);
  });

  test.each<[string, SortRule[], string, SortRule[]]>([
    [
      'appends when 2+ sorts are applied',
      [
        { code: 'name', descending: false },
        { code: 'birthdate', descending: true },
      ],
      'Sort A to Z',
      [
        { code: 'name', descending: false },
        { code: 'birthdate', descending: true },
        { code: 'gender', descending: false },
      ],
    ],
    [
      'updates direction in place for a column already in a multi-sort',
      [
        { code: 'name', descending: false },
        { code: 'gender', descending: false },
      ],
      'Sort Z to A',
      [
        { code: 'name', descending: false },
        { code: 'gender', descending: true },
      ],
    ],
    [
      'replaces the sort when fewer than 2 are applied',
      [{ code: 'name', descending: false }],
      'Sort A to Z',
      [{ code: 'gender', descending: false }],
    ],
  ])('Sorting the gender column %s', async (_, sortRules, label, expected) => {
    const { current } = await setup({
      search: { resourceType: 'Patient', sortRules },
      searchParams: [param('Patient', 'gender')],
    });
    await act(async () => {
      fireEvent.click(await screen.findByText(label));
    });
    expect(current().sortRules).toMatchObject(expected);
  });
});
