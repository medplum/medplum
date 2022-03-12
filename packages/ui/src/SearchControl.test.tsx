import { Operator } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { SearchControl, SearchControlProps } from './SearchControl';

const medplum = new MockClient();

describe('SearchControl', () => {
  function setup(args: SearchControlProps): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <SearchControl {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders results', async () => {
    const props = {
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
      onLoad: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Renders _lastUpdated filter', async () => {
    const props = {
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
      onLoad: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    expect(screen.getByText('greater than or equals', { exact: false })).toBeInTheDocument();
  });

  test('Renders empty results', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Bob',
          },
        ],
      },
      onLoad: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('empty-search'));
    });

    const control = screen.getByTestId('empty-search');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Renders choice of type', async () => {
    const props = {
      search: {
        resourceType: 'Observation',
        fields: ['value[x]'],
      },
      onLoad: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
    expect(screen.getByText('30 x')).toBeInTheDocument();
  });

  test('Renders with checkboxes', async () => {
    const props = {
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
      onLoad: jest.fn(),
      checkboxesEnabled: true,
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Renders empty results with checkboxes', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: 'Bob',
          },
        ],
      },
      onLoad: jest.fn(),
      checkboxesEnabled: true,
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('empty-search'));
    });

    const control = screen.getByTestId('empty-search');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Renders search parameter columns', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        fields: ['id', '_lastUpdated', 'name', 'birthDate', 'active', 'telecom', 'email', 'phone'],
      },
      onLoad: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();

    expect(screen.getByText('chunkylover53@aol.com [home email]')).toBeInTheDocument();
    expect(screen.getByText('555-7334 [home phone]')).toBeInTheDocument();
  });

  test('Renders filters', async () => {
    const props = {
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
      onLoad: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Next page button', async () => {
    const props = {
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
      onChange: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('next-page-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-page-button'));
    });

    expect(props.onChange).toBeCalled();
  });

  test('Next page button without onChange listener', async () => {
    const props = {
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
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('next-page-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-page-button'));
    });
  });

  test('Prev page button', async () => {
    const props = {
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
      onChange: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('prev-page-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('prev-page-button'));
    });

    expect(props.onChange).toBeCalled();
  });

  test('New button', async () => {
    const onNew = jest.fn();

    setup({
      search: {
        resourceType: 'Patient',
      },
      onNew,
    });

    await act(async () => {
      await waitFor(() => screen.getByText('New...'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('New...'));
    });

    expect(onNew).toBeCalled();
  });

  test('Export button', async () => {
    const onExport = jest.fn();

    setup({
      search: {
        resourceType: 'Patient',
      },
      onExport,
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Export...'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Export...'));
    });

    expect(onExport).toBeCalled();
  });

  test('Delete button', async () => {
    const onDelete = jest.fn();

    setup({
      search: {
        resourceType: 'Patient',
      },
      onDelete,
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Delete...'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Delete...'));
    });

    expect(onDelete).toBeCalled();
  });

  test('Click on row', async () => {
    const props = {
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
      onClick: jest.fn(),
      onAuxClick: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('search-control-row'));
    });

    await act(async () => {
      const rows = screen.getAllByTestId('search-control-row');
      fireEvent.click(rows[0]);
    });

    expect(props.onClick).toBeCalled();
    expect(props.onAuxClick).not.toBeCalled();
  });

  test('Aux click on row', async () => {
    const props = {
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
      onClick: jest.fn(),
      onAuxClick: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('search-control-row'));
    });

    await act(async () => {
      const rows = screen.getAllByTestId('search-control-row');
      fireEvent.click(rows[0], { button: 1 });
    });

    expect(props.onClick).not.toBeCalled();
    expect(props.onAuxClick).toBeCalled();
  });

  test('Open field editor', async () => {
    const props = {
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
      onLoad: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('fields-button'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Field editor onOk', async () => {
    const props = {
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
      onLoad: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('fields-button'));
    });

    await act(async () => {
      await waitFor(() => screen.getByTestId('dialog-ok'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('dialog-ok'));
    });
  });

  test('Field editor onCancel', async () => {
    const props = {
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
      onLoad: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('fields-button'));
    });

    await act(async () => {
      await waitFor(() => screen.getByTestId('dialog-cancel'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('dialog-cancel'));
    });
  });

  test('Open filter editor', async () => {
    const props = {
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
      onLoad: jest.fn(),
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('filters-button'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Click all checkbox', async () => {
    const props = {
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
      onLoad: jest.fn(),
      checkboxesEnabled: true,
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();

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
    const props = {
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
      onLoad: jest.fn(),
      checkboxesEnabled: true,
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();

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
    const props = {
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
      onLoad: jest.fn(),
      checkboxesEnabled: true,
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();

    // Click on the column header to activate the popup menu
    await act(async () => {
      fireEvent.click(screen.getByText('Name'));
    });

    // Expect the popup menu to be open now
    expect(screen.getByText('Sort A to Z')).toBeInTheDocument();

    // Click on a sort operation
    await act(async () => {
      fireEvent.click(screen.getByText('Sort A to Z'));
    });

    // Click on the column header to activate the popup menu
    await act(async () => {
      fireEvent.click(screen.getByText('Name'));
    });

    // Click outside the popup to dismiss it
    await act(async () => {
      fireEvent.click(document.body);
    });

    // Expect the popup menu to be closed now
    expect(screen.queryByText('Sort A to Z')).toBeNull();
  });
});
