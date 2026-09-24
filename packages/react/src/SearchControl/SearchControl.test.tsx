// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { Bundle, Resource } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { SearchControlMenuAction, SearchControlProps, SearchControlToolbarAction } from './SearchControl';
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

  test('Patient name column shows a single preferred name with an avatar', async () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: 'multi-name',
            name: [
              { use: 'usual', given: ['Rob'], family: 'Roe' },
              { use: 'official', given: ['Robert'], family: 'Roe' },
              { given: ['Bobby'], family: 'Roe' },
            ],
          },
        },
      ],
    };
    const props: SearchControlProps = {
      search: { resourceType: 'Patient', fields: ['id', 'name'] },
    };

    await setup(props, bundle);

    expect(await screen.findByText('Bobby Roe')).toBeInTheDocument();
    expect(screen.queryByText('Robert Roe')).toBeNull();
    expect(screen.queryByText('Rob Roe')).toBeNull();
    expect(document.body.querySelector('.mantine-Avatar-root')).toBeInTheDocument();
  });

  test('Practitioner name column also shows a single preferred name with an avatar', async () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [
        {
          resource: {
            resourceType: 'Practitioner',
            id: 'prac-1',
            name: [
              { use: 'official', given: ['Gregory'], family: 'House' },
              { given: ['Greg'], family: 'House' },
            ],
          },
        },
      ],
    };
    await setup({ search: { resourceType: 'Practitioner', fields: ['id', 'name'] } }, bundle);

    expect(await screen.findByText('Greg House')).toBeInTheDocument();
    expect(screen.queryByText('Gregory House')).toBeNull();
    expect(document.body.querySelector('.mantine-Avatar-root')).toBeInTheDocument();
  });

  test('Patient name column falls back to official when no unspecified-use name exists', async () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: 'official-name',
            name: [
              { use: 'usual', given: ['Rob'], family: 'Roe' },
              { use: 'official', given: ['Robert'], family: 'Roe' },
            ],
          },
        },
      ],
    };
    await setup({ search: { resourceType: 'Patient', fields: ['id', 'name'] } }, bundle);

    expect(await screen.findByText('Robert Roe')).toBeInTheDocument();
    expect(screen.queryByText('Rob Roe')).toBeNull();
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

  test('Delete is disabled until a row is selected', async () => {
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
  });

  test('Delete confirms in a modal before calling onDelete', async () => {
    const onDelete = vi.fn();

    await setup({
      search: {
        resourceType: 'Patient',
      },
      checkboxesEnabled: true,
      onDelete,
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

  describe('Delete confirmation', () => {
    const twoPatients: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 2,
      entry: [
        { resource: { resourceType: 'Patient', id: 'p1', name: [{ given: ['Ann'], family: 'One' }] } },
        { resource: { resourceType: 'Patient', id: 'p2', name: [{ given: ['Bob'], family: 'Two' }] } },
      ],
    };

    async function setupDelete(props: Partial<SearchControlProps>, bundle = twoPatients): Promise<void> {
      await setup({ search: { resourceType: 'Patient', fields: ['name'] }, checkboxesEnabled: true, ...props }, bundle);
      expect(await screen.findByText('Ann One')).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByTestId('all-checkbox'));
      });
    }

    async function clickMenuDelete(): Promise<void> {
      await openActionsMenu();
      await act(async () => {
        fireEvent.click(await screen.findByText('Delete'));
      });
    }

    function confirmButton(name = 'Delete'): HTMLElement {
      return screen.getByRole('button', { name });
    }

    test('Default modal calls onDelete once with the selected IDs and clears the selection', async () => {
      const onDelete = vi.fn();
      await setupDelete({ onDelete });
      await clickMenuDelete();

      expect(await screen.findByText('Delete 2 Patients?')).toBeInTheDocument();
      expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(confirmButton());
      });
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledWith(['p1', 'p2']);
      expect(screen.getAllByTestId('row-checkbox').every((el) => !(el as HTMLInputElement).checked)).toBe(true);
    });

    test('Default title uses a readable, pluralized type label', async () => {
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 1,
        entry: [
          {
            resource: {
              resourceType: 'MedicationRequest',
              id: 'm1',
              status: 'active',
              intent: 'order',
              subject: { display: 'x' },
            },
          },
        ],
      };
      await setup(
        {
          search: { resourceType: 'MedicationRequest', fields: ['status'] },
          checkboxesEnabled: true,
          onDelete: vi.fn(),
        },
        bundle
      );
      expect(await screen.findAllByTestId('row-checkbox')).toHaveLength(1);
      await act(async () => {
        fireEvent.click(screen.getByTestId('all-checkbox'));
      });
      await clickMenuDelete();
      expect(await screen.findByText('Delete 1 Medication Request?')).toBeInTheDocument();
    });

    test('confirmDelete={false} calls onDelete right away with no modal', async () => {
      const onDelete = vi.fn();
      await setupDelete({ onDelete, confirmDelete: false });
      await clickMenuDelete();

      expect(onDelete).toHaveBeenCalledWith(['p1', 'p2']);
      expect(screen.queryByText('This action cannot be undone.')).not.toBeInTheDocument();
    });

    test('Custom copy functions receive the selected count', async () => {
      await setupDelete({
        onDelete: vi.fn(),
        confirmDelete: {
          title: (count) => `Remove ${count} people?`,
          message: (count) => `They will be gone (${count}).`,
          confirmLabel: 'Remove',
        },
      });
      await clickMenuDelete();

      expect(await screen.findByText('Remove 2 people?')).toBeInTheDocument();
      expect(screen.getByText('They will be gone (2).')).toBeInTheDocument();
      expect(confirmButton('Remove')).toBeInTheDocument();
    });

    test('Custom copy strings are used as-is', async () => {
      await setupDelete({ onDelete: vi.fn(), confirmDelete: { title: 'Sure?', message: 'Really.' } });
      await clickMenuDelete();

      expect(await screen.findByText('Sure?')).toBeInTheDocument();
      expect(screen.getByText('Really.')).toBeInTheDocument();
    });

    test('Async onDelete shows loading, then closes and clears the selection', async () => {
      let resolve: () => void = () => undefined;
      const onDelete = vi.fn(
        () =>
          new Promise<void>((r) => {
            resolve = r;
          })
      );
      await setupDelete({ onDelete });
      await clickMenuDelete();

      await act(async () => {
        fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
      });
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(confirmButton()).toHaveAttribute('data-loading', 'true');
      expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();

      await act(async () => {
        resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.queryByText('This action cannot be undone.')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('row-checkbox').every((el) => !(el as HTMLInputElement).checked)).toBe(true);
    });

    test('Async onDelete rejection keeps the modal open and the selection', async () => {
      let reject: () => void = () => undefined;
      const onDelete = vi.fn(
        () =>
          new Promise<void>((_, r) => {
            reject = r;
          })
      );
      await setupDelete({ onDelete });
      await clickMenuDelete();

      await act(async () => {
        fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
      });
      await act(async () => {
        reject();
      });
      expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
      expect(confirmButton()).not.toHaveAttribute('data-loading');
      expect(screen.getAllByTestId('row-checkbox').every((el) => (el as HTMLInputElement).checked)).toBe(true);
    });

    test('A thenable onDelete result is awaited like a Promise', async () => {
      let resolve: () => void = () => undefined;
      const thenable: PromiseLike<void> = {
        then: (onFulfilled) => {
          resolve = () => onFulfilled?.();
          return thenable as PromiseLike<never>;
        },
      };
      const onDelete = vi.fn(() => thenable as unknown as Promise<void>);
      await setupDelete({ onDelete });
      await clickMenuDelete();

      await act(async () => {
        fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
      });
      expect(confirmButton()).toHaveAttribute('data-loading', 'true');

      await act(async () => {
        resolve();
      });
      expect(confirmButton()).not.toHaveAttribute('data-loading');
    });

    test('The modal title keeps its count while closing', async () => {
      await setupDelete({ onDelete: vi.fn() });
      await clickMenuDelete();
      expect(await screen.findByText('Delete 2 Patients?')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(confirmButton());
      });
      expect(screen.queryByText('Delete 0 Patients?')).not.toBeInTheDocument();
    });
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

  test('Right click on row opens the resource context menu', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['name'],
        filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Simpson' }],
      },
    };

    await setup(props);
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    await act(async () => {
      fireEvent.contextMenu(screen.getAllByTestId('search-control-row')[0]);
    });

    expect(await screen.findByText('Open Patient')).toBeInTheDocument();
    expect(screen.getByText('Open Patient in a New Tab')).toBeInTheDocument();
    expect(screen.getByText('Copy Link')).toBeInTheDocument();
  });

  test('Open in a new tab from the row context menu', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['name'],
        filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Simpson' }],
      },
    };

    await setup(props);
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    await act(async () => {
      fireEvent.contextMenu(screen.getAllByTestId('search-control-row')[0]);
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Open Patient in a New Tab'));
    });

    expect(openSpy).toHaveBeenCalledWith(`/Patient/${HomerSimpson.id}`, '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  test('Copy link from the row context menu', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['name'],
        filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Simpson' }],
      },
    };

    await setup(props);
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    await act(async () => {
      fireEvent.contextMenu(screen.getAllByTestId('search-control-row')[0]);
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Copy Link'));
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`/Patient/${HomerSimpson.id}`));
  });

  test('Reference cell context menu targets the referenced resource', async () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [
        {
          resource: {
            resourceType: 'Observation',
            id: 'obs1',
            status: 'final',
            code: { text: 'Test' },
            subject: { reference: `Patient/${HomerSimpson.id}`, display: 'Homer Simpson' },
          },
        },
      ],
    };
    const props: SearchControlProps = {
      search: {
        resourceType: 'Observation',
        fields: ['subject'],
      },
    };

    await setup(props, bundle);
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    await act(async () => {
      fireEvent.contextMenu(screen.getByText('Homer Simpson'));
    });

    expect(await screen.findByText('Open Patient in a New Tab')).toBeInTheDocument();
    expect(screen.queryByText('Open Observation in a New Tab')).not.toBeInTheDocument();
  });

  const simpsonSearch: SearchRequest = {
    resourceType: 'Patient',
    fields: ['name'],
    filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Simpson' }],
  };

  const observationBundle: Bundle = {
    resourceType: 'Bundle',
    type: 'searchset',
    total: 1,
    entry: [
      {
        resource: {
          resourceType: 'Observation',
          id: 'obs1',
          status: 'final',
          code: { text: 'Test' },
          subject: { reference: `Patient/${HomerSimpson.id}`, display: 'Homer Simpson' },
        },
      },
    ],
  };

  test('rowContextMenu={false} leaves the browser menu on rows and references', async () => {
    await setup({ search: simpsonSearch, rowContextMenu: false });
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    const row = screen.getAllByTestId('search-control-row')[0];
    let notCancelled = true;
    await act(async () => {
      notCancelled = fireEvent.contextMenu(row);
    });
    expect(notCancelled).toBe(true);
    expect(screen.queryByText('Copy Link')).not.toBeInTheDocument();
    expect(row.className).not.toContain('trActive');
  });

  test('rowContextMenu={false} leaves the browser menu on reference cells', async () => {
    await setup(
      { search: { resourceType: 'Observation', fields: ['subject'] }, rowContextMenu: false },
      observationBundle
    );
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    let notCancelled = true;
    await act(async () => {
      notCancelled = fireEvent.contextMenu(screen.getByText('Homer Simpson'));
    });
    expect(notCancelled).toBe(true);
    expect(screen.queryByText('Copy Link')).not.toBeInTheDocument();
  });

  test('Custom getResourceHref is used by all three items', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const mockNavigate = vi.fn();
    const getResourceHref = (resource: Resource): string => `/custom/${resource.id}`;
    await setup({ search: simpsonSearch, rowContextMenu: { getResourceHref } }, undefined, undefined, mockNavigate);
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    const openMenu = async (): Promise<void> => {
      await act(async () => {
        fireEvent.contextMenu(screen.getAllByTestId('search-control-row')[0]);
      });
    };

    await openMenu();
    await act(async () => {
      fireEvent.click(await screen.findByText('Open Patient in a New Tab'));
    });
    expect(openSpy).toHaveBeenCalledWith(`/custom/${HomerSimpson.id}`, '_blank', 'noopener,noreferrer');

    await openMenu();
    await act(async () => {
      fireEvent.click(await screen.findByText('Copy Link'));
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/custom/${HomerSimpson.id}`);

    await openMenu();
    await act(async () => {
      fireEvent.click(await screen.findByText('Open Patient'));
    });
    expect(mockNavigate).toHaveBeenCalledWith(`/custom/${HomerSimpson.id}`);
    openSpy.mockRestore();
  });

  test('With onClick and no getResourceHref, items fall back to the click handlers', async () => {
    const onClick = vi.fn();
    const onAuxClick = vi.fn();
    await setup({ search: simpsonSearch, onClick, onAuxClick });
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    await act(async () => {
      fireEvent.contextMenu(screen.getAllByTestId('search-control-row')[0]);
    });
    expect(await screen.findByText('Open Patient')).toBeInTheDocument();
    expect(screen.queryByText('Copy Link')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Open Patient'));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0].resource.id).toBe(HomerSimpson.id);

    await act(async () => {
      fireEvent.contextMenu(screen.getAllByTestId('search-control-row')[0]);
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Open Patient in a New Tab'));
    });
    expect(onAuxClick).toHaveBeenCalledTimes(1);
  });

  test('With onClick only, Open in a New Tab is hidden', async () => {
    await setup({ search: simpsonSearch, onClick: vi.fn() });
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    await act(async () => {
      fireEvent.contextMenu(screen.getAllByTestId('search-control-row')[0]);
    });
    expect(await screen.findByText('Open Patient')).toBeInTheDocument();
    expect(screen.queryByText('Open Patient in a New Tab')).not.toBeInTheDocument();
    expect(screen.queryByText('Copy Link')).not.toBeInTheDocument();
  });

  test('items.copyLink: false shows exactly two items', async () => {
    await setup({ search: simpsonSearch, rowContextMenu: { items: { copyLink: false } } });
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    await act(async () => {
      fireEvent.contextMenu(screen.getAllByTestId('search-control-row')[0]);
    });
    expect(await screen.findByText('Open Patient')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem', { hidden: true })).toHaveLength(2);
    expect(screen.queryByText('Copy Link')).not.toBeInTheDocument();
  });

  test('A right-click with no available items falls through to the browser menu', async () => {
    await setup({ search: simpsonSearch, rowContextMenu: { getResourceHref: () => undefined } });
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    let notCancelled = true;
    await act(async () => {
      notCancelled = fireEvent.contextMenu(screen.getAllByTestId('search-control-row')[0]);
    });
    expect(notCancelled).toBe(true);
    expect(screen.queryByText('Open Patient')).not.toBeInTheDocument();
  });

  test('A non-relative reference does not open a reference menu', async () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [
        {
          resource: {
            resourceType: 'Observation',
            id: 'obs1',
            status: 'final',
            code: { text: 'Test' },
            subject: { reference: '#contained', display: 'Contained Patient' },
          },
        },
      ],
    };
    await setup({ search: { resourceType: 'Observation', fields: ['subject'] } }, bundle);
    const row = (await screen.findAllByTestId('search-control-row'))[0];
    const referenceCell = row.querySelector('td > div') as Element;
    expect(referenceCell).toBeTruthy();

    await act(async () => {
      fireEvent.contextMenu(referenceCell);
    });
    expect(await screen.findByText('Open Observation')).toBeInTheDocument();
    expect(screen.queryByText(/#contained/)).not.toBeInTheDocument();
  });

  test('Custom getReferenceHref is used for reference cells', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await setup(
      {
        search: { resourceType: 'Observation', fields: ['subject'] },
        rowContextMenu: { getReferenceHref: (reference) => `/ref/${reference.reference}` },
      },
      observationBundle
    );
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    await act(async () => {
      fireEvent.contextMenu(screen.getByText('Homer Simpson'));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Copy Link'));
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/ref/Patient/${HomerSimpson.id}`);
  });

  test('Right click in the checkbox cell does not open the menu', async () => {
    await setup({ search: simpsonSearch, checkboxesEnabled: true });
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

    await act(async () => {
      fireEvent.contextMenu(screen.getAllByRole('checkbox')[1]);
    });
    expect(screen.queryByText('Open Patient')).not.toBeInTheDocument();
  });

  describe('Checkbox cell hit target', () => {
    async function setupCheckboxes(): Promise<{
      onClick: ReturnType<typeof vi.fn>;
      onAuxClick: ReturnType<typeof vi.fn>;
    }> {
      const onClick = vi.fn();
      const onAuxClick = vi.fn();
      await setup({ search: simpsonSearch, checkboxesEnabled: true, onClick, onAuxClick });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
      return { onClick, onAuxClick };
    }

    function rowCheckbox(): HTMLInputElement {
      return screen.getAllByTestId('row-checkbox')[0] as HTMLInputElement;
    }

    test('Clicking the input toggles once and does not fire row click', async () => {
      const { onClick, onAuxClick } = await setupCheckboxes();
      await act(async () => {
        fireEvent.click(rowCheckbox());
      });
      expect(rowCheckbox().checked).toBe(true);
      expect(onClick).not.toHaveBeenCalled();
      expect(onAuxClick).not.toHaveBeenCalled();
    });

    test('Clicking the cell padding toggles the checkbox', async () => {
      const { onClick, onAuxClick } = await setupCheckboxes();
      const cell = screen.getAllByTestId('row-checkbox-cell')[0];
      await act(async () => {
        fireEvent.click(cell);
      });
      expect(rowCheckbox().checked).toBe(true);
      await act(async () => {
        fireEvent.click(cell);
      });
      expect(rowCheckbox().checked).toBe(false);
      expect(onClick).not.toHaveBeenCalled();
      expect(onAuxClick).not.toHaveBeenCalled();
    });

    test('Clicking the wrapper div toggles the checkbox', async () => {
      const { onClick } = await setupCheckboxes();
      const wrapper = screen.getAllByTestId('row-checkbox-cell')[0].firstElementChild as Element;
      await act(async () => {
        fireEvent.click(wrapper);
      });
      expect(rowCheckbox().checked).toBe(true);
      expect(onClick).not.toHaveBeenCalled();
    });

    test('Clicking the Mantine icon toggles the checkbox', async () => {
      const { onClick } = await setupCheckboxes();
      const icon = screen.getAllByTestId('row-checkbox-cell')[0].querySelector('svg') as Element;
      expect(icon).toBeTruthy();
      await act(async () => {
        fireEvent.click(icon);
      });
      expect(rowCheckbox().checked).toBe(true);
      expect(onClick).not.toHaveBeenCalled();
    });

    test('Middle-click in the checkbox cell does not fire onAuxClick', async () => {
      const { onAuxClick } = await setupCheckboxes();
      await act(async () => {
        fireEvent(
          screen.getAllByTestId('row-checkbox-cell')[0],
          new MouseEvent('auxclick', { bubbles: true, button: 1 })
        );
      });
      expect(onAuxClick).not.toHaveBeenCalled();
    });

    test('Clicking the header cell padding toggles select-all', async () => {
      await setupCheckboxes();
      const headerCell = screen.getByTestId('all-checkbox-cell');
      await act(async () => {
        fireEvent.click(headerCell);
      });
      expect(screen.getByTestId('all-checkbox')).toBeChecked();
      expect(rowCheckbox().checked).toBe(true);
      await act(async () => {
        fireEvent.click(headerCell);
      });
      expect(screen.getByTestId('all-checkbox')).not.toBeChecked();
      expect(rowCheckbox().checked).toBe(false);
    });

    test('Row clicks outside the checkbox cell still fire onClick', async () => {
      const { onClick } = await setupCheckboxes();
      await act(async () => {
        fireEvent.click(screen.getByText('Homer Simpson'));
      });
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(rowCheckbox().checked).toBe(false);
    });
  });

  test('Columns editor opens', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['name', 'birthDate'],
      },
      onLoad: vi.fn(),
    };

    await setup(props);

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Columns'));
    });

    expect(await screen.findByText('Reset Default')).toBeInTheDocument();
    expect(screen.getByLabelText('column-name')).toBeInTheDocument();
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
      fireEvent.click(await screen.findByLabelText('column-birthDate'));
    });

    expect(currSearch?.fields).toEqual(['name']);
  });

  test('Filter popover opens', async () => {
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

    expect(await screen.findByText('Add Filter')).toBeInTheDocument();
    expect(screen.getByText('Add Filter')).toBeInTheDocument();
  });

  test('Sort popover opens', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
      },
      onLoad: vi.fn(),
    };

    await setup(props);

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Sort'));
    });

    expect(await screen.findByText('Add Sort')).toBeInTheDocument();
    expect(screen.getByText('Add Sort')).toBeInTheDocument();
  });

  test('Column header sort menu', async () => {
    let currSearch: SearchRequest | undefined;
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['id', 'name'],
      },
      onLoad: vi.fn(),
      onChange: (e) => {
        currSearch = e.definition;
      },
    };

    await setup(props);

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Name'));
    });

    expect(screen.queryByText('Contains...')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(await screen.findByText('Sort A to Z'));
    });

    expect(currSearch?.sortRules).toMatchObject([{ code: 'name', descending: false }]);
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

  test('Deprecated hideFilters is still accepted and has no effect', async () => {
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

  test('Custom toolbar action renders and fires onClick', async () => {
    const onSync = vi.fn();
    await setup({
      search: { resourceType: 'Patient' },
      toolbarActions: [{ key: 'sync', label: 'Sync', icon: <span>sync-icon</span>, onClick: onSync }],
    });

    const syncButton = await screen.findByLabelText('Sync');
    expect(syncButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(syncButton);
    });

    expect(onSync).toHaveBeenCalled();
  });

  test('hideRefresh removes the built-in Refresh button', async () => {
    await setup({
      search: { resourceType: 'Patient' },
      hideRefresh: true,
      toolbarActions: [{ key: 'sync', label: 'Sync', icon: <span>sync-icon</span>, onClick: vi.fn() }],
    });

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(screen.queryByLabelText('Refresh')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Sync')).toBeInTheDocument();
  });

  describe('Custom actions', () => {
    const originalWidth = window.innerWidth;

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    });

    async function openMenu(): Promise<void> {
      await act(async () => {
        fireEvent.click(screen.getByLabelText('Actions'));
      });
    }

    test('menuActions alone render the actions menu', async () => {
      const onArchive = vi.fn();
      await setup({
        search: simpsonSearch,
        hideRefresh: true,
        menuActions: [{ key: 'archive', label: 'Archive', onClick: onArchive }],
      });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

      await openMenu();
      await act(async () => {
        fireEvent.click(await screen.findByText('Archive'));
      });
      expect(onArchive).toHaveBeenCalledWith([]);
    });

    test('Custom menu items sit after built-ins and before Delete', async () => {
      await setup({
        search: simpsonSearch,
        onBulk: vi.fn(),
        onDelete: vi.fn(),
        menuActions: [{ key: 'archive', label: 'Archive', onClick: vi.fn() }],
      });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

      await openMenu();
      await screen.findByText('Archive');
      const labels = screen.getAllByRole('menuitem', { hidden: true }).map((el) => el.textContent);
      expect(labels).toEqual(['Refresh', 'Bulk Apply', 'Archive', 'Delete']);
    });

    test('requiresSelection disables the item until a row is checked, then passes the IDs', async () => {
      const onArchive = vi.fn();
      await setup({
        search: simpsonSearch,
        checkboxesEnabled: true,
        menuActions: [{ key: 'archive', label: 'Archive', requiresSelection: true, onClick: onArchive }],
      });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

      await openMenu();
      const item = (await screen.findByText('Archive')).closest('button') as HTMLButtonElement;
      expect(item).toBeDisabled();

      await act(async () => {
        fireEvent.click(screen.getAllByTestId('row-checkbox')[0]);
      });
      await act(async () => {
        fireEvent.click(screen.getByText('Archive'));
      });
      expect(onArchive).toHaveBeenCalledWith([HomerSimpson.id]);
    });

    test('requiresSelection toolbar action is disabled with no selection', async () => {
      const onSync = vi.fn();
      await setup({
        search: simpsonSearch,
        toolbarActions: [
          { key: 'sync', label: 'Sync', icon: <span>sync</span>, requiresSelection: true, onClick: onSync },
        ],
      });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
      expect(screen.getByLabelText('Sync')).toBeDisabled();
    });

    test('href menu item navigates in-app on plain click and keeps the browser link on Cmd-click', async () => {
      const navigate = vi.fn();
      await setup(
        { search: simpsonSearch, menuActions: [{ key: 'reports', label: 'Reports', href: '/reports' }] },
        undefined,
        undefined,
        navigate
      );
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

      await openMenu();
      const link = (await screen.findByText('Reports')).closest('a') as HTMLAnchorElement;
      expect(link).toHaveAttribute('href', '/reports');

      let notCancelled = false;
      await act(async () => {
        notCancelled = fireEvent.click(link, { metaKey: true });
      });
      expect(notCancelled).toBe(true);
      expect(navigate).not.toHaveBeenCalled();

      await openMenu();
      await act(async () => {
        fireEvent.click((await screen.findByText('Reports')).closest('a') as HTMLAnchorElement);
      });
      expect(navigate).toHaveBeenCalledWith('/reports');
    });

    test('href toolbar action renders as a link and navigates in-app', async () => {
      const navigate = vi.fn();
      await setup(
        {
          search: simpsonSearch,
          toolbarActions: [{ key: 'reports', label: 'Reports', icon: <span>r</span>, href: '/reports' }],
        },
        undefined,
        undefined,
        navigate
      );
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

      const link = screen.getByLabelText('Reports');
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/reports');
      await act(async () => {
        fireEvent.click(link);
      });
      expect(navigate).toHaveBeenCalledWith('/reports');
    });

    test('Filled toolbar action uses the filled variant', async () => {
      await setup({
        search: simpsonSearch,
        toolbarActions: [
          { key: 'sync', label: 'Sync', icon: <span>s</span>, variant: 'filled', color: 'green', onClick: vi.fn() },
        ],
      });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
      expect(screen.getByLabelText('Sync')).toHaveAttribute('data-variant', 'filled');
    });

    test('hideActionsMenu removes the button even with handlers', async () => {
      await setup({
        search: simpsonSearch,
        onDelete: vi.fn(),
        onBulk: vi.fn(),
        menuActions: [{ key: 'archive', label: 'Archive', onClick: vi.fn() }],
        hideActionsMenu: true,
      });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
      expect(screen.queryByLabelText('Actions')).not.toBeInTheDocument();
    });

    test('Custom actions are hidden below 768px', async () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
      await setup({
        search: simpsonSearch,
        toolbarActions: [{ key: 'sync', label: 'Sync', icon: <span>s</span>, onClick: vi.fn() }],
        menuActions: [{ key: 'archive', label: 'Archive', onClick: vi.fn() }],
      });
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
      expect(screen.queryByLabelText('Sync')).not.toBeInTheDocument();

      await openMenu();
      expect(await screen.findByText('Refresh')).toBeInTheDocument();
      expect(screen.queryByText('Archive')).not.toBeInTheDocument();
    });

    test('Action types reject onClick with href and accept a zero-argument onClick', () => {
      const zeroArg: SearchControlMenuAction = { key: 'a', label: 'A', onClick: () => undefined };
      // @ts-expect-error - an action cannot have both onClick and href
      const both: SearchControlMenuAction = { key: 'b', label: 'B', onClick: () => undefined, href: '/b' };
      // @ts-expect-error - toolbar actions require an icon
      const noIcon: SearchControlToolbarAction = { key: 'c', label: 'C', onClick: () => undefined };
      expect([zeroArg, both, noIcon]).toHaveLength(3);
    });
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
