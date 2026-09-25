// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Menu } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import { globalSchema, Operator } from '@medplum/core';
import type { SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen, userEvent } from '../test-utils/render';
import type { SearchPopupMenuProps } from './SearchPopupMenu';
import { SearchPopupMenu } from './SearchPopupMenu';

const medplum = new MockClient();

function param(resourceType: string, code: string): SearchParameter {
  return globalSchema.types[resourceType].searchParams?.[code] as SearchParameter;
}

describe('SearchPopupMenu', () => {
  beforeAll(async () => {
    await medplum.requestSchema('Patient');
    await medplum.requestSchema('Observation');
  });

  async function setup(partialProps: Partial<SearchPopupMenuProps>): Promise<void> {
    const props: SearchPopupMenuProps = {
      search: partialProps.search ?? { resourceType: 'Patient' },
      searchParams: partialProps.searchParams,
      onChange: partialProps.onChange ?? vi.fn(),
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

    await toggleMenu();
  }

  test('Renders nothing without a search parameter', async () => {
    await setup({ searchParams: undefined });
    expect(screen.queryByText('Sort A to Z')).not.toBeInTheDocument();
  });

  test('Only shows the two sort options - no filter controls', async () => {
    await setup({ searchParams: [param('Patient', 'name')] });
    expect(await screen.findByText('Sort A to Z')).toBeInTheDocument();
    expect(screen.getByText('Sort Z to A')).toBeInTheDocument();
    expect(screen.queryByText('Equals...')).not.toBeInTheDocument();
    expect(screen.queryByText('Contains...')).not.toBeInTheDocument();
    expect(screen.queryByText('Missing')).not.toBeInTheDocument();
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });

  test('Date sort uses oldest/newest labels', async () => {
    let currSearch: SearchRequest = { resourceType: 'Patient' };
    await setup({
      searchParams: [param('Patient', 'birthdate')],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(await screen.findByText('Sort Oldest to Newest'));
    });
    expect(currSearch.sortRules).toMatchObject([{ code: 'birthdate', descending: false }]);

    await act(async () => {
      fireEvent.click(await screen.findByText('Sort Newest to Oldest'));
    });
    expect(currSearch.sortRules).toMatchObject([{ code: 'birthdate', descending: true }]);
  });

  test('Date columns offer relative dates above "Filter by this column"', async () => {
    await setup({ searchParams: [param('Patient', 'birthdate')], onFilterByColumn: vi.fn() });
    await screen.findByText('Sort Oldest to Newest');
    const labels = screen.getAllByRole('menuitem', { hidden: true }).map((el) => el.textContent);
    expect(labels).toEqual([
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
    const labels = screen.getAllByRole('menuitem', { hidden: true }).map((el) => el.textContent);
    expect(labels).toEqual([
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
    let currSearch: SearchRequest = { resourceType: 'Patient' };
    await setup({ searchParams: [param('Patient', 'birthdate')], onChange: (e) => (currSearch = e) });
    await act(async () => {
      fireEvent.click(await screen.findByText('Today'));
    });
    expect(currSearch.filters).toMatchObject([
      { code: 'birthdate', operator: Operator.GREATER_THAN_OR_EQUALS },
      { code: 'birthdate', operator: Operator.LESS_THAN_OR_EQUALS },
    ]);
  });

  test('Non-date columns have no relative dates', async () => {
    await setup({ searchParams: [param('Patient', 'name')] });
    expect(await screen.findByText('Sort A to Z')).toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
  });

  test('Quantity sort uses smallest/largest labels', async () => {
    await setup({ searchParams: [param('Observation', 'value-quantity')] });
    expect(await screen.findByText('Sort Smallest to Largest')).toBeInTheDocument();
    expect(screen.getByText('Sort Largest to Smallest')).toBeInTheDocument();
  });

  test('Reference columns are now sortable (A to Z)', async () => {
    let currSearch: SearchRequest = { resourceType: 'Patient' };
    await setup({
      searchParams: [param('Patient', 'organization')],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(await screen.findByText('Sort A to Z'));
    });
    expect(currSearch.sortRules).toMatchObject([{ code: 'organization', descending: false }]);
  });

  test('Token columns are now sortable (A to Z)', async () => {
    let currSearch: SearchRequest = { resourceType: 'Patient' };
    await setup({
      searchParams: [param('Patient', 'gender')],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(await screen.findByText('Sort Z to A'));
    });
    expect(currSearch.sortRules).toMatchObject([{ code: 'gender', descending: true }]);
  });

  test('No "Filter by this column" item without the callback', async () => {
    await setup({ searchParams: [param('Patient', 'name')] });
    expect(await screen.findByText('Sort A to Z')).toBeInTheDocument();
    expect(screen.queryByText('Filter by this column')).not.toBeInTheDocument();
  });

  test('"Filter by this column" invokes the callback with the search parameter', async () => {
    const onFilterByColumn = vi.fn();
    await setup({ searchParams: [param('Patient', 'name')], onFilterByColumn });
    await act(async () => {
      fireEvent.click(await screen.findByText('Filter by this column'));
    });
    expect(onFilterByColumn).toHaveBeenCalledWith(expect.objectContaining({ code: 'name' }));
  });

  test('Adds to existing sorts when 2+ are already applied', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      sortRules: [
        { code: 'name', descending: false },
        { code: 'birthdate', descending: true },
      ],
    };
    await setup({
      search: currSearch,
      searchParams: [param('Patient', 'gender')],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(await screen.findByText('Sort A to Z'));
    });
    expect(currSearch.sortRules).toMatchObject([
      { code: 'name', descending: false },
      { code: 'birthdate', descending: true },
      { code: 'gender', descending: false },
    ]);
  });

  test('Updates direction in place for a column already in a multi-sort', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      sortRules: [
        { code: 'name', descending: false },
        { code: 'gender', descending: false },
      ],
    };
    await setup({
      search: currSearch,
      searchParams: [param('Patient', 'gender')],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(await screen.findByText('Sort Z to A'));
    });
    expect(currSearch.sortRules).toMatchObject([
      { code: 'name', descending: false },
      { code: 'gender', descending: true },
    ]);
  });

  test('Replaces the sort when fewer than 2 are applied', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      sortRules: [{ code: 'name', descending: false }],
    };
    await setup({
      search: currSearch,
      searchParams: [param('Patient', 'gender')],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(await screen.findByText('Sort A to Z'));
    });
    expect(currSearch.sortRules).toMatchObject([{ code: 'gender', descending: false }]);
  });

  test('Sorts by the first search parameter for multi-param columns', async () => {
    let currSearch: SearchRequest = { resourceType: 'Patient' };
    await setup({
      searchParams: [param('Patient', 'name'), param('Patient', 'given')],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(await screen.findByText('Sort A to Z'));
    });
    expect(currSearch.sortRules).toMatchObject([{ code: 'name', descending: false }]);
  });
});

async function toggleMenu(): Promise<void> {
  const toggleMenuButton = await screen.findByText('Toggle menu');
  await userEvent.click(toggleMenuButton);
}
