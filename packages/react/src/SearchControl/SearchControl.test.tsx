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
    medplum: MockClient = new MockClient()
  ): Promise<{ rerender: (props: SearchControlProps) => Promise<void> }> {
    if (returnVal) {
      medplum.search = vi.fn().mockResolvedValue(returnVal);
    }
    const { rerender: _rerender } = await act(async () =>
      render(<SearchControl {...props} />, ({ children }) => (
        <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
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

  test('Hides actions button when no actions are available', async () => {
    await setup({ search: { resourceType: 'Patient' } });

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
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

    expect(screen.getByText('greater than or equals', { exact: false })).toBeInTheDocument();
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

  test('Export button', async () => {
    const onExportCsv = vi.fn();

    await setup({
      search: {
        resourceType: 'Patient',
      },
      onExportCsv,
    });

    await act(async () => {
      fireEvent.click(await screen.findByLabelText('Actions'));
    });

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

    await act(async () => {
      fireEvent.click(await screen.findByTestId('all-checkbox'));
    });

    await act(async () => {
      fireEvent.click(await screen.findByLabelText('Actions'));
    });

    await act(async () => {
      fireEvent.click(await screen.findByText('Delete'));
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    });

    expect(onDelete).toHaveBeenCalled();
  });

  test('Bulk button', async () => {
    const onBulk = vi.fn();

    await setup({
      search: {
        resourceType: 'Patient',
      },
      onBulk,
    });

    await act(async () => {
      fireEvent.click(await screen.findByLabelText('Actions'));
    });

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

  test('Field editor onOk', async () => {
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
    };

    await setup(props);

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Fields'));
    });

    expect(await screen.findByText('OK')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });
  });

  test('Field editor onCancel', async () => {
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
    };

    await setup(props);

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Fields'));
    });

    expect(await screen.findByLabelText('Close')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Close'));
    });
  });

  async function openFieldOptions(): Promise<void> {
    await setup({ search: { resourceType: 'Patient', fields: ['name'] }, onLoad: vi.fn() });
    await act(async () => {
      fireEvent.click(screen.getByText('Fields'));
    });
    await act(async () => {
      fireEvent.focus(await screen.findByPlaceholderText('Select fields to display'));
    });
    await screen.findByRole('option', { name: 'Name', hidden: true });
  }

  function fieldOption(name: string): HTMLElement | null {
    return screen.queryByRole('option', { name, hidden: true });
  }

  test('Field editor offers resource properties that have no search parameter', async () => {
    await openFieldOptions();
    expect(fieldOption('Photo')).toBeInTheDocument();
    expect(fieldOption('Marital Status')).toBeInTheDocument();
    expect(fieldOption('Meta')).toBeInTheDocument();
  });

  test('Field editor offers a property once, even when a search parameter shares its name', async () => {
    await openFieldOptions();
    expect(fieldOption('Birth Date')).toBeInTheDocument();
    expect(fieldOption('Birthdate')).toBeNull();
    expect(screen.getAllByRole('option', { name: 'ID', hidden: true })).toHaveLength(1);
  });

  test('Field editor still offers search parameters that are not properties', async () => {
    await openFieldOptions();
    expect(fieldOption('Last Updated')).toBeInTheDocument();
    expect(fieldOption('Phone')).toBeInTheDocument();
  });

  test('Filter editor onOk', async () => {
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
    };

    await setup(props);

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Filters'));
    });

    expect(await screen.findByText('OK')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });
  });

  test('Filter editor onCancel', async () => {
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
    };

    await setup(props);

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Filters'));
    });

    expect(await screen.findByLabelText('Close')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Close'));
    });
  });

  test('Popup menu and prompt', async () => {
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
        fields: ['id', 'name'],
      },
      onLoad: vi.fn(),
    };

    await setup(props);

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Name'));
    });

    const containsButton = await screen.findByText('Contains...');
    await act(async () => {
      fireEvent.click(containsButton);
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search value'), {
        target: { value: 'Washington' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });
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
      checkboxesEnabled: true,
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(props.onLoad).toHaveBeenCalled();

    // Click on the column header to activate the popup menu
    await act(async () => {
      fireEvent.click(screen.getByText('Name'));
    });

    // Expect the popup menu to be open now
    const sortButton = await screen.findByText('Sort A to Z');
    expect(sortButton).toBeInTheDocument();

    // Click on a sort operation
    await act(async () => {
      fireEvent.click(sortButton);
    });

    // Click on the column header to activate the popup menu
    await act(async () => {
      fireEvent.click(screen.getByText('Name'));
    });
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
  });

  test('Hide filters', async () => {
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
      hideFilters: true,
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(props.onLoad).toHaveBeenCalled();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.queryByText('no filters')).not.toBeInTheDocument();
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

    expect(await screen.findByText('missing true')).toBeInTheDocument();

    expect(screen.getByText('missing true')).toBeInTheDocument();
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

    const refreshButton = screen.getByTitle('Refresh');
    expect(refreshButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(refreshButton);
    });

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
    expect(onLoad).toHaveBeenCalled();
  });

  test('Row keyboard navigation', async () => {
    const onClick = vi.fn();
    const onAuxClick = vi.fn();
    await setup({
      search: {
        resourceType: 'Patient',
        filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Simpson' }],
      },
      checkboxesEnabled: true,
      onClick,
      onAuxClick,
    });
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    const rows = screen.getAllByTestId('search-control-row');
    expect(rows.length).toBeGreaterThan(1);
    const first = rows[0];
    const second = rows[1];
    const last = rows[rows.length - 1];

    // Roving tab index: one tab stop, following focus
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    await act(async () => {
      second.focus();
    });
    expect(first).toHaveAttribute('tabindex', '-1');
    expect(second).toHaveAttribute('tabindex', '0');

    // Arrow keys move between rows and stop at the edges
    await act(async () => {
      first.focus();
      fireEvent.keyDown(first, { key: 'ArrowDown' });
    });
    expect(second).toHaveFocus();
    await act(async () => {
      fireEvent.keyDown(second, { key: 'ArrowUp' });
    });
    expect(first).toHaveFocus();
    await act(async () => {
      fireEvent.keyDown(first, { key: 'ArrowUp' });
    });
    expect(first).toHaveFocus();
    await act(async () => {
      last.focus();
      fireEvent.keyDown(last, { key: 'ArrowDown' });
    });
    expect(last).toHaveFocus();

    // Home and End
    await act(async () => {
      fireEvent.keyDown(last, { key: 'Home' });
    });
    expect(first).toHaveFocus();
    await act(async () => {
      fireEvent.keyDown(first, { key: 'End' });
    });
    expect(last).toHaveFocus();

    // Enter clicks the row; Ctrl/Cmd+Enter is an aux click
    await act(async () => {
      fireEvent.keyDown(first, { key: 'Enter' });
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0].resource.id).toEqual(HomerSimpson.id);
    expect(onAuxClick).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.keyDown(first, { key: 'Enter', ctrlKey: true });
      fireEvent.keyDown(first, { key: 'Enter', metaKey: true });
    });
    expect(onAuxClick).toHaveBeenCalledTimes(2);
    expect(onClick).toHaveBeenCalledTimes(1);

    // Space toggles the row checkbox without clicking the row
    const checkbox = screen.getAllByTestId<HTMLInputElement>('row-checkbox')[0];
    expect(checkbox.checked).toEqual(false);
    await act(async () => {
      fireEvent.keyDown(first, { key: ' ' });
    });
    expect(checkbox.checked).toEqual(true);
    await act(async () => {
      fireEvent.keyDown(first, { key: ' ' });
    });
    expect(checkbox.checked).toEqual(false);
    expect(onClick).toHaveBeenCalledTimes(1);

    // Unrelated keys keep their default; handled keys do not
    let letterDefaultAllowed = false;
    let arrowDefaultAllowed = true;
    await act(async () => {
      letterDefaultAllowed = fireEvent.keyDown(first, { key: 'a' });
      arrowDefaultAllowed = fireEvent.keyDown(first, { key: 'ArrowDown' });
    });
    expect(letterDefaultAllowed).toEqual(true);
    expect(arrowDefaultAllowed).toEqual(false);

    // Keys from a control inside the row are not handled
    const cell = first.querySelector('td') as HTMLElement;
    await act(async () => {
      first.focus();
      fireEvent.keyDown(cell, { key: 'ArrowDown' });
      fireEvent.keyDown(cell, { key: 'Enter' });
    });
    expect(first).toHaveFocus();
    expect(onClick).toHaveBeenCalledTimes(1);
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
