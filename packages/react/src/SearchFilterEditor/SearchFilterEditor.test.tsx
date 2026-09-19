// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, typeInAutocomplete, waitFor } from '../test-utils/render';
import { SearchFilterEditor } from './SearchFilterEditor';

const medplum = new MockClient();

async function setup(child: ReactNode): Promise<void> {
  await act(async () => {
    render(<MedplumProvider medplum={medplum}>{child}</MedplumProvider>);
  });
}

/**
 * Opens a Mantine Select (by test id) and clicks the option with the given label.
 * @param testId - The Select input's data-testid.
 * @param optionName - The option label (or matcher) to click.
 */
async function selectMantineOption(testId: string, optionName: string | RegExp): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
  });
  // The options render into a portal that the a11y tree treats as hidden.
  await act(async () => {
    fireEvent.click(screen.getByRole('option', { hidden: true, name: optionName }));
  });
}

describe('SearchFilterEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  test('Not visible', async () => {
    await setup(
      <SearchFilterEditor search={{ resourceType: 'Patient' }} visible={false} onOk={vi.fn()} onCancel={vi.fn()} />
    );

    expect(screen.queryByTestId('filter-field')).toBeNull();
    expect(screen.queryByTestId('filter-operation')).toBeNull();
    expect(screen.queryByTestId('filter-value')).toBeNull();
    expect(screen.queryByText('OK')).toBeNull();
    expect(screen.queryByText('Cancel')).toBeNull();
  });

  test('Add filter', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    await setup(
      <SearchFilterEditor
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Add Filter'));
    });

    const fieldInput = screen.getByTestId('filter-0-row-filter-field');
    expect(fieldInput).toBeInTheDocument();
    expect(fieldInput).toHaveValue('');

    await selectMantineOption('filter-0-row-filter-field', 'Name');
    await selectMantineOption('filter-0-row-filter-operation', 'contains');

    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-0-row-filter-value'), {
        target: { value: 'Alice' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.filters).toMatchObject([
      {
        code: 'name',
        operator: Operator.CONTAINS,
        value: 'Alice',
      },
    ]);
  });

  test('Edit reference filter', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'organization',
          operator: Operator.EQUALS,
          value: 'Organization/125',
        },
      ],
    };

    await setup(
      <SearchFilterEditor
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Wait for the resource to load
    expect(screen.getByText('Test Organization')).toBeInTheDocument();

    // Clear the existing value
    const clearButton = screen.getByTitle('Clear all');
    await act(async () => {
      fireEvent.click(clearButton);
    });

    const input = screen.getAllByRole('searchbox')[0] as HTMLInputElement;
    await typeInAutocomplete(input, 'Different');
    expect(await screen.findByText('Different')).toBeInTheDocument();
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Wait for the resource to load
    expect(screen.getByText('Different')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.filters).toMatchObject([
      {
        code: 'organization',
        operator: Operator.EQUALS,
        value: 'Organization/456',
      },
    ]);
  });

  test('Delete filter', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.CONTAINS,
          value: 'Alice',
        },
      ],
    };

    await setup(
      <SearchFilterEditor
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Delete filter'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.filters?.length).toEqual(0);
  });

  test('Edit filter', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.CONTAINS,
          value: 'Alice',
        },
      ],
    };

    await setup(
      <SearchFilterEditor
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Bob' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.filters?.length).toEqual(1);
    expect(currSearch.filters?.[0]?.value).toEqual('Bob');
  });

  test('Handle unknown search param type', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'not-a-code',
          operator: Operator.EQUALS,
          value: 'foo',
        },
      ],
    };

    await setup(
      <SearchFilterEditor
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    // An unknown code has no matching option, so the field combobox shows nothing (not the raw code).
    expect(screen.getByTestId('filter-0-row-filter-field')).toHaveValue('');
  });

  test('_lastUpdated filter', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['id', 'name'],
      filters: [
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN_OR_EQUALS,
          value: '2022-01-01T00:00:00.000Z',
        },
      ],
    };

    await setup(
      <SearchFilterEditor
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    // Wait for the resource to load
    await waitFor(() => screen.queryAllByText('_lastUpdated').length > 0);

    const input = screen.getByTestId<HTMLInputElement>('filter-0-row-filter-value');
    expect(input.value).toMatch(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  });

  test('Meta fields use readable labels and stay grouped as metadata', async () => {
    // ProjectMembership has both `project`/`profile` elements and `_project`/`_profile` meta fields.
    const currSearch: SearchRequest = {
      resourceType: 'ProjectMembership',
      filters: [{ code: '', operator: Operator.EQUALS, value: '' }],
    };

    await setup(<SearchFilterEditor search={currSearch} visible={true} onOk={vi.fn()} onCancel={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('filter-0-row-filter-field'));
    });

    // Both the element field (project/profile) and the meta field (_project/_profile) render with the
    // same readable label, so each appears at least twice across the Fields and Metadata groups.
    expect(screen.getAllByRole('option', { hidden: true, name: 'Project' }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('option', { hidden: true, name: 'Profile' }).length).toBeGreaterThanOrEqual(2);

    expect(screen.getByText('Fields')).toBeInTheDocument();
    expect(screen.getByText('Metadata')).toBeInTheDocument();
  });

  test('Quantity filter', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Observation',
      filters: [
        {
          code: 'value-quantity',
          operator: Operator.GREATER_THAN,
          value: '5',
        },
      ],
    };

    await setup(
      <SearchFilterEditor
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    const input = screen.getByDisplayValue('5');
    await act(async () => {
      fireEvent.change(input, { target: { value: '6' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.filters).toMatchObject([
      {
        code: 'value-quantity',
        operator: Operator.GREATER_THAN,
        value: '6',
      },
    ]);
  });
});
