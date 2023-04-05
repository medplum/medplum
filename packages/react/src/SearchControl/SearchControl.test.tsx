import { Operator } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { SearchControl, SearchControlProps } from './SearchControl';

describe('SearchControl', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  async function setup(args: SearchControlProps): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={new MockClient()}>
            <SearchControl {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
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
      onLoad: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByText('Homer Simpson'));

    expect(props.onLoad).toBeCalled();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
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
      onLoad: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

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
      onLoad: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByText('No results'));

    const control = screen.getByText('No results');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Renders choice of type', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Observation',
        fields: ['value[x]'],
      },
      onLoad: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
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
      onLoad: jest.fn(),
      checkboxesEnabled: true,
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
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
      onLoad: jest.fn(),
      checkboxesEnabled: true,
    };

    await setup(props);

    await waitFor(() => screen.getByText('No results'));

    const control = screen.getByText('No results');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Renders search parameter columns', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['id', '_lastUpdated', 'name', 'birthDate', 'active', 'email', 'phone'],
      },
      onLoad: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();

    expect(screen.getByText('chunkylover53@aol.com [home email]')).toBeInTheDocument();
    expect(screen.getByText('555-7334 [home phone]')).toBeInTheDocument();
  });

  test('Renders nested properties', async () => {
    const props: SearchControlProps = {
      search: {
        resourceType: 'Patient',
        fields: ['id', '_lastUpdated', 'name', 'address-city', 'address-state'],
      },
      onLoad: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();

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
      onLoad: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
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
      onChange: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByLabelText('Next page'));

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next page'));
    });

    expect(props.onChange).toBeCalled();
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

    await waitFor(() => screen.getByLabelText('Next page'));

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
      onChange: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByLabelText('Previous page'));

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Previous page'));
    });

    expect(props.onChange).toBeCalled();
  });

  test('New button', async () => {
    const onNew = jest.fn();

    await setup({
      search: {
        resourceType: 'Patient',
      },
      onNew,
    });

    await waitFor(() => screen.getByText('New...'));

    await act(async () => {
      fireEvent.click(screen.getByText('New...'));
    });

    expect(onNew).toBeCalled();
  });

  test('Export button', async () => {
    const onExportCSV = jest.fn();

    await setup({
      search: {
        resourceType: 'Patient',
      },
      onExportCSV,
    });

    await waitFor(() => screen.getByText('Export...'));

    await act(async () => {
      fireEvent.click(screen.getByText('Export...'));
    });

    expect(onExportCSV).toBeCalled();
  });

  test('Delete button', async () => {
    const onDelete = jest.fn();

    await setup({
      search: {
        resourceType: 'Patient',
      },
      onDelete,
    });

    await waitFor(() => screen.getByText('Delete...'));

    await act(async () => {
      fireEvent.click(screen.getByText('Delete...'));
    });

    expect(onDelete).toBeCalled();
  });

  test('Bulk button', async () => {
    const onBulk = jest.fn();

    await setup({
      search: {
        resourceType: 'Patient',
      },
      onBulk,
    });

    await waitFor(() => screen.getByText('Bulk...'));

    await act(async () => {
      fireEvent.click(screen.getByText('Bulk...'));
    });

    expect(onBulk).toBeCalled();
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
      onClick: jest.fn(),
      onAuxClick: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    await waitFor(() => screen.getAllByTestId('search-control-row'));

    await act(async () => {
      const rows = screen.getAllByTestId('search-control-row');
      fireEvent.click(rows[0]);
    });

    expect(props.onClick).toBeCalled();
    expect(props.onAuxClick).not.toBeCalled();
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
      onClick: jest.fn(),
      onAuxClick: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    await waitFor(() => screen.getAllByTestId('search-control-row'));

    await act(async () => {
      const rows = screen.getAllByTestId('search-control-row');
      fireEvent.click(rows[0], { button: 1 });
    });

    expect(props.onClick).not.toBeCalled();
    expect(props.onAuxClick).toBeCalled();
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
      onLoad: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    await act(async () => {
      fireEvent.click(screen.getByText('Fields'));
    });

    await waitFor(() => screen.getByText('OK'));

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
      onLoad: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    await act(async () => {
      fireEvent.click(screen.getByText('Fields'));
    });

    await waitFor(() => screen.getByLabelText('Close'));

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Close'));
    });
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
      onLoad: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    await act(async () => {
      fireEvent.click(screen.getByText('Filters'));
    });

    await waitFor(() => screen.getByText('OK'));

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
      onLoad: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    await act(async () => {
      fireEvent.click(screen.getByText('Filters'));
    });

    await waitFor(() => screen.getByLabelText('Close'));

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
      onLoad: jest.fn(),
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    await act(async () => {
      fireEvent.click(screen.getByText('Name'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Contains...'));
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
      onLoad: jest.fn(),
      checkboxesEnabled: true,
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

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
      onLoad: jest.fn(),
      checkboxesEnabled: true,
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

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
      onLoad: jest.fn(),
      checkboxesEnabled: true,
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

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
      onLoad: jest.fn(),
      hideToolbar: true,
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
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
      onLoad: jest.fn(),
      hideFilters: true,
    };

    await setup(props);

    await waitFor(() => screen.getByTestId('search-control'));

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.queryByText('no filters')).not.toBeInTheDocument();
  });
});
