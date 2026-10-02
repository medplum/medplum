// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { Bundle } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { SearchControlProps } from './SearchControl';
import { SearchControl } from './SearchControl';

describe('SearchControl', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  async function setup(
    props: SearchControlProps,
    returnVal?: Bundle,
    medplum: MockClient = new MockClient(),
    navigate?: (path: string) => void
  ): Promise<{ rerender: (props: SearchControlProps) => Promise<void> }> {
    if (returnVal) {
      medplum.search = vi.fn().mockResolvedValue(returnVal);
    }
    const { rerender: _rerender } = await act(async () =>
      render(<SearchControl {...props} />, ({ children }) => (
        <MedplumProvider medplum={medplum} navigate={navigate}>
          {children}
        </MedplumProvider>
      ))
    );
    return {
      rerender: async (props: SearchControlProps) => {
        await act(async () => _rerender(<SearchControl {...props} />));
      },
    };
  }

  test('Renders results', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Simpson',
          },
        ],
        fields: ['id', '_lastUpdated', 'name'],
      },
      onLoad: vi.fn(),
    };

    await setup(props);

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    expect(props.onLoad).toHaveBeenCalled();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
  });

  test.each([1, 2])('Renders all performers in a reference array with %i entries', async (count) => {
    const performers = [
      { reference: 'Organization/lab-1', display: 'Review Laboratory' },
      { reference: 'Organization/lab-2', display: 'Second Laboratory' },
    ].slice(0, count);
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [
        {
          resource: {
            resourceType: 'DiagnosticReport',
            id: 'report-1',
            status: 'final',
            code: { text: 'Reference rendering test' },
            performer: performers,
          },
        },
      ],
    };

    await setup({ search: { resourceType: 'DiagnosticReport', fields: ['id', 'performer'] } }, bundle);

    for (const performer of performers) {
      expect(screen.getByText(performer.display)).toBeInTheDocument();
    }
  });

  test.each([undefined, 'Patient/external'])('Renders reference display text with reference %s', async (reference) => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [
        {
          resource: {
            resourceType: 'Observation',
            id: 'observation-1',
            status: 'final',
            code: { text: 'Reference display test' },
            subject: { reference, display: 'External Patient' },
          },
        },
      ],
    };

    await setup({ search: { resourceType: 'Observation', fields: ['id', 'subject'] } }, bundle);

    const name = screen.getByText('External Patient');
    expect(name).toBeInTheDocument();
    if (reference) {
      expect(name.closest('a')).toHaveAttribute('href', `/${reference}`);
    } else {
      expect(name.closest('a')).toBeNull();
    }
  });

  test('Renders additional columns', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['id', 'name'],
      },
      additionalColumns: [
        {
          name: 'Custom Column',
          renderCell: (resource) => <span>cell-{resource.id}</span>,
        },
      ],
    };

    await setup(props);

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
    // The additional column header and a computed cell for the row are rendered.
    expect(screen.getByText('Custom Column')).toBeInTheDocument();
    expect(screen.getByText(`cell-${HomerSimpson.id}`)).toBeInTheDocument();
  });

  test('Rerender does not trigger `loadResult` when `search` deep equals `memoizedSearch`', async () => {
    const search = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Simpson',
        },
      ],
      fields: ['id', '_lastUpdated', 'name'],
    } as SearchRequest;

    const props = {
      search,
      onLoad: vi.fn(),
    };

    const { rerender } = await setup(props);

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    expect(props.onLoad).toHaveBeenCalled();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();

    props.onLoad.mockClear();

    await rerender({ ...props, search: { ...search } });
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    expect(props.onLoad).not.toHaveBeenCalled();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Rerender triggers `loadResult` when `search` does is not deep equal to `memoizedSearch`', async () => {
    const search = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Simpson',
        },
      ],
      fields: ['id', '_lastUpdated', 'name'],
    } as SearchRequest;

    const props = {
      search,
      onLoad: vi.fn(),
    };

    const { rerender } = await setup(props);

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    expect(props.onLoad).toHaveBeenCalled();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();

    const searchesToTest = [
      {
        ...search,
        fields: ['id', 'name'],
      },
      {
        ...search,
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Homer',
          },
        ],
      },
    ];

    for (const search of searchesToTest) {
      props.onLoad.mockClear();

      await rerender({ ...props, search });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

      expect(props.onLoad).toHaveBeenCalled();
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    }
  });

  test('Renders _lastUpdated filter', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        filters: [
          {
            code: '_lastUpdated',
            operator: Operator.GREATER_THAN_OR_EQUALS,
            value: '2021-12-01T00:00:00.000Z',
          },
        ],
        fields: ['id', '_lastUpdated', 'name'],
      },
      onLoad: vi.fn(),
    };

    await setup(props);

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Renders empty results', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'this-does-not-exist',
          },
        ],
      },
      onLoad: vi.fn(),
    };

    await setup(props);
    expect(await screen.findByText('No results')).toBeInTheDocument();
    expect(props.onLoad).toHaveBeenCalled();
  });

  test('Renders choice of type', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Observation',
        fields: ['value[x]'],
      },
      onLoad: vi.fn(),
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(props.onLoad).toHaveBeenCalled();
    expect(screen.getByText('30 x')).toBeInTheDocument();
  });

  test('Renders with checkboxes', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Simpson',
          },
        ],
        fields: ['id', '_lastUpdated', 'name'],
      },
      onLoad: vi.fn(),
      checkboxesEnabled: true,
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(props.onLoad).toHaveBeenCalled();
  });

  test('Renders empty results with checkboxes', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'this-does-not-exist',
          },
        ],
      },
      onLoad: vi.fn(),
      checkboxesEnabled: true,
    };

    await setup(props);
    expect(await screen.findByText('No results')).toBeInTheDocument();
    expect(props.onLoad).toHaveBeenCalled();
  });

  test('Renders search parameter columns', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['id', '_lastUpdated', 'name', 'birthDate', 'active', 'email', 'phone'],
      },
      onLoad: vi.fn(),
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(props.onLoad).toHaveBeenCalled();
    expect(screen.getByText('chunkylover53@aol.com [home email]')).toBeInTheDocument();
    expect(screen.getByText('555-7334 [home phone]')).toBeInTheDocument();
  });

  test('Renders nested properties', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['id', '_lastUpdated', 'name', 'address-city', 'address-state'],
      },
      onLoad: vi.fn(),
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(props.onLoad).toHaveBeenCalled();
    expect(screen.getByText('Springfield')).toBeInTheDocument();
    expect(screen.getByText('IL')).toBeInTheDocument();
  });

  test('Renders filters', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['id', 'name'],
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Simpson',
          },
        ],
      },
      onLoad: vi.fn(),
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(props.onLoad).toHaveBeenCalled();
  });

  test('Next page button', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        count: 1,
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Simpson',
          },
        ],
      },
      onChange: vi.fn(),
    };

    await setup(props);

    expect(await screen.findByLabelText('Next page')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next page'));
    });

    expect(props.onChange).toHaveBeenCalled();
  });

  test('Next page button without onChange listener', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        count: 1,
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Simpson',
          },
        ],
      },
    };

    await setup(props);

    expect(await screen.findByLabelText('Next page')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next page'));
    });
  });

  test('Prev page button', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        count: 1,
        offset: 1,
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Simpson',
          },
        ],
      },
      onChange: vi.fn(),
    };

    await setup(props);

    expect(await screen.findByLabelText('Previous page')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Previous page'));
    });

    expect(props.onChange).toHaveBeenCalled();
  });

  test('New button', async () => {
    const onNew = vi.fn();

    await setup({
      search: {
        resourceType: 'Patient',
      },
      onNew,
    });

    expect(await screen.findByLabelText('New Patient')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('New Patient'));
    });

    expect(onNew).toHaveBeenCalled();
  });

  async function openActionsMenu(): Promise<void> {
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Actions'));
    });
  }

  test('Export action', async () => {
    const onExportCsv = vi.fn();

    await setup({
      search: {
        resourceType: 'Patient',
      },
      onExportCsv,
    });

    await openActionsMenu();
    await act(async () => {
      fireEvent.click(await screen.findByText('Export'));
    });

    expect(await screen.findByText('Export as CSV')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Export as CSV'));
    });
  });

  test('Delete button', async () => {
    const onDelete = vi.fn();

    await setup({
      search: {
        resourceType: 'Patient',
      },
      checkboxesEnabled: true,
      onDelete,
    });

    await openActionsMenu();
    const deleteItem = await screen.findByText('Delete');
    expect(deleteItem.closest('button')).toHaveAttribute('data-disabled', 'true');
    expect(onDelete).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('all-checkbox'));
    });

    await openActionsMenu();
    await act(async () => {
      fireEvent.click(await screen.findByText('Delete'));
    });

    expect(await screen.findByText(/cannot be undone/i)).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    expect(onDelete).toHaveBeenCalled();
  });

  test('Bulk action', async () => {
    const onBulk = vi.fn();

    await setup({
      search: {
        resourceType: 'Patient',
      },
      onBulk,
    });

    await openActionsMenu();
    await act(async () => {
      fireEvent.click(await screen.findByText('Bulk Apply'));
    });

    expect(onBulk).toHaveBeenCalled();
  });

  test('Click on row', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Simpson',
          },
        ],
      },
      onClick: vi.fn(),
      onAuxClick: vi.fn(),
    };

    await setup(props);

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByTestId('search-control-row')[0]);
    });

    expect(props.onClick).toHaveBeenCalled();
    expect(props.onAuxClick).not.toHaveBeenCalled();
  });

  test('Aux click on row', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Simpson',
          },
        ],
      },
      onClick: vi.fn(),
      onAuxClick: vi.fn(),
    };

    await setup(props);

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    // Test response to middle mouse button
    await act(async () => {
      const rows = screen.getAllByTestId('search-control-row');
      fireEvent.click(rows[0], { button: 1 });
    });

    expect(props.onClick).not.toHaveBeenCalled();
    expect(props.onAuxClick).toHaveBeenCalled();

    // Test response to CMD key (MacOS)
    await act(async () => {
      const rows = screen.getAllByTestId('search-control-row');
      fireEvent.click(rows[0], { metaKey: true });
    });

    expect(props.onClick).not.toHaveBeenCalled();
    expect(props.onAuxClick).toHaveBeenCalledTimes(2);

    // Test response to Ctrl key (Windows)
    await act(async () => {
      const rows = screen.getAllByTestId('search-control-row');
      fireEvent.click(rows[0], { ctrlKey: true });
    });

    expect(props.onClick).not.toHaveBeenCalled();
    expect(props.onAuxClick).toHaveBeenCalledTimes(3);
  });

  test('Columns editor hides a column', async () => {
    let currSearch: SearchRequest | undefined;
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['name', 'birthDate'],
      },
      onLoad: vi.fn(),
      onChange: (e) => {
        currSearch = e.definition;
      },
    };

    await setup(props);

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Columns'));
    });

    await act(async () => {
      fireEvent.click(await screen.findByTestId('column-birthDate'));
    });

    expect(currSearch?.fields).toEqual(['name']);
  });

  test('Click all checkbox', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Simpson',
          },
        ],
      },
      onLoad: vi.fn(),
      checkboxesEnabled: true,
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(props.onLoad).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('all-checkbox'));
    });

    const allCheckbox = screen.getByTestId('all-checkbox');
    expect(allCheckbox).toBeDefined();
    expect((allCheckbox as HTMLInputElement).checked).toEqual(true);

    const rowCheckboxes = screen.queryAllByTestId('row-checkbox');
    expect(rowCheckboxes).toBeDefined();
    expect(rowCheckboxes.length).toEqual(2);
    expect((rowCheckboxes[0] as HTMLInputElement).checked).toEqual(true);
    expect((rowCheckboxes[1] as HTMLInputElement).checked).toEqual(true);
  });

  test('Click row checkbox', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Simpson',
          },
        ],
      },
      onLoad: vi.fn(),
      checkboxesEnabled: true,
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(props.onLoad).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getAllByTestId('row-checkbox')[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getAllByTestId('row-checkbox')[1]);
    });

    const allCheckbox = screen.getByTestId('all-checkbox');
    expect(allCheckbox).toBeDefined();
    expect((allCheckbox as HTMLInputElement).checked).toEqual(true);

    const rowCheckboxes = screen.queryAllByTestId('row-checkbox');
    expect(rowCheckboxes).toBeDefined();
    expect(rowCheckboxes.length).toEqual(2);
    expect((rowCheckboxes[0] as HTMLInputElement).checked).toEqual(true);
    expect((rowCheckboxes[1] as HTMLInputElement).checked).toEqual(true);
  });

  test('Activate popup menu', async () => {
    let currSearch: SearchRequest | undefined;
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['id', 'name'],
        filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Simpson' }],
      },
      onLoad: vi.fn(),
      checkboxesEnabled: true,
      onChange: (e) => {
        currSearch = e.definition;
      },
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(props.onLoad).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByText('Name'));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Sort A to Z'));
    });

    expect(currSearch?.sortRules).toMatchObject([{ code: 'name', descending: false }]);
  });

  test('Hide toolbar', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Simpson',
          },
        ],
        fields: ['id', '_lastUpdated', 'name'],
      },
      onLoad: vi.fn(),
      hideToolbar: true,
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(props.onLoad).toHaveBeenCalled();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.queryByText('Patient')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    });
    expect(await screen.findByText('Sort A to Z')).toBeInTheDocument();
    expect(screen.queryByText('Filter by this column')).not.toBeInTheDocument();
  });

  test('Handle reference missing filter', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['id', '_lastUpdated', 'name', 'organization'],
        filters: [
          {
            code: 'organization',
            operator: Operator.MISSING,
            value: 'true',
          },
        ],
      },
      onLoad: vi.fn(),
    };

    await setup(props);

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Refresh results', async () => {
    const onLoad = vi.fn();

    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Simpson',
          },
        ],
        fields: ['id', '_lastUpdated', 'name'],
      },
      onLoad,
    };

    await setup(props);
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
    expect(onLoad).toHaveBeenCalled();
    onLoad.mockReset();

    await openActionsMenu();
    await act(async () => {
      fireEvent.click(await screen.findByText('Refresh'));
    });

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
    expect(onLoad).toHaveBeenCalled();
  });

  describe('Pagination', () => {
    const onLoad = vi.fn();
    const search: SearchRequest = {
      resourceType: 'Patient',
      count: 20,
      offset: 0,
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Simpson',
        },
      ],
      fields: ['id', '_lastUpdated', 'name'],
    };
    test('No results', async () => {
      const props: SearchControlProps = {
        search,
        onLoad,
      };
      await setup(props, {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 0,
        entry: [],
      });
      expect(await screen.findByText('No results')).toBeInTheDocument();
      const element = screen.getByTestId('count-display');
      expect(element.textContent).toBe('0-0 of 0');
    });
    test('One result', async () => {
      const props: SearchControlProps = {
        search,
        onLoad,
      };
      await setup(props, {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 1,
        entry: [{ resource: HomerSimpson }],
      });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
      const element = screen.getByTestId('count-display');
      expect(element.textContent).toBe('1-1 of 1');
    });
    test('Single Page', async () => {
      const props: SearchControlProps = {
        search,
        onLoad,
      };
      await setup(props, {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 5,
        entry: [{ resource: HomerSimpson }, ...Array(4).fill({ resourceType: 'Patient' })],
      });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
      const element = screen.getByTestId('count-display');
      expect(element.textContent).toBe('1-5 of 5');
    });

    test('Multiple Pages', async () => {
      const props: SearchControlProps = {
        search,
        onLoad,
      };
      await setup(props, {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 40,
        entry: [{ resource: HomerSimpson }, ...Array(19).fill({ resourceType: 'Patient' })],
      });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
      const element = screen.getByTestId('count-display');
      expect(element.textContent).toBe('1-20 of 40');
    });

    test('Large Estimated Count', async () => {
      const props: SearchControlProps = {
        search,
        onLoad,
      };

      await setup(props, {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 403091,
        entry: [{ resource: HomerSimpson }, ...Array(19).fill({ resourceType: 'Patient' })],
      });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
      const element = screen.getByTestId('count-display');
      expect(element.textContent).toBe('1-20 of 403,091');
    });

    test('Large Estimated Count w/ High Offset', async () => {
      const props: SearchControlProps = {
        search: { ...search, offset: 200000, count: 20 },
        onLoad,
      };

      await setup(props, {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 403091,
        entry: [{ resource: HomerSimpson }, ...Array(19).fill({ resourceType: 'Patient' })],
        link: [
          {
            relation: 'next',
            url: '',
          },
        ],
      });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
      expect(screen.getByTestId('count-display').textContent).toBe('200,001-200,020 of 403,091');
    });
  });
});
