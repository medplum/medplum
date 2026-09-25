// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { SearchFilterPopover } from './SearchFilterPopover';

const medplum = new MockClient();

async function setup(search: SearchRequest, onChange = vi.fn()): Promise<{ onChange: ReturnType<typeof vi.fn> }> {
  await act(async () => {
    await medplum.requestSchema(search.resourceType);
  });
  await act(async () => {
    render(wrap(<SearchFilterPopover search={search} onChange={onChange} />));
  });
  return { onChange };
}

function wrap(child: ReactNode): ReactNode {
  return <MedplumProvider medplum={medplum}>{child}</MedplumProvider>;
}

async function openPopover(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByText('Filters'));
  });
  await screen.findByText('Add Filter');
}

describe('SearchFilterPopover', () => {
  test('Renders trigger and opens', async () => {
    await setup({ resourceType: 'Patient' });
    await openPopover();
    expect(screen.getByText('No filters applied')).toBeInTheDocument();
    expect(screen.getByText('Add Filter')).toBeInTheDocument();
  });

  test('Shows the active filter count and existing conditions', async () => {
    await setup({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Simpson' }],
    });
    await openPopover();
    expect(screen.getByText('Where')).toBeInTheDocument();
    expect(screen.getByLabelText('filter-0-field', { selector: 'input' })).toHaveValue('Name');
  });

  test('Add Filter adds an empty row', async () => {
    await setup({ resourceType: 'Patient' });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByText('Add Filter'));
    });
    expect(screen.getByLabelText('filter-0-field', { selector: 'input' })).toBeInTheDocument();
  });

  test('Delete removes the filter and emits onChange', async () => {
    const { onChange } = await setup({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Simpson' }],
    });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('delete-filter-0'));
    });
    expect(onChange).toHaveBeenCalled();
    const lastArg = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(lastArg.filters ?? []).toHaveLength(0);
  });

  test('Building a full condition emits the completed filter', async () => {
    const { onChange } = await setup({ resourceType: 'Patient' });
    await openPopover();

    await act(async () => {
      fireEvent.click(screen.getByText('Add Filter'));
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('filter-0-field', { selector: 'input' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Name'));
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('filter-0-operator', { selector: 'input' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('contains'));
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-0-value'), { target: { value: 'Simpson' } });
    });

    const lastArg = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(lastArg.filters).toMatchObject([{ code: 'name', operator: Operator.CONTAINS, value: 'Simpson' }]);
  });

  test('Deleting a row keeps the next row showing its own value', async () => {
    await setup({
      resourceType: 'Patient',
      filters: [
        { code: 'name', operator: Operator.EQUALS, value: 'Smith' },
        { code: 'name', operator: Operator.EQUALS, value: 'Jones' },
      ],
    });
    await openPopover();
    expect(screen.getByTestId('filter-0-value')).toHaveValue('Smith');

    await act(async () => {
      fireEvent.click(screen.getByLabelText('delete-filter-0'));
    });
    expect(screen.getByTestId('filter-0-value')).toHaveValue('Jones');
  });

  test('Editing an incomplete row does not re-run the search', async () => {
    const { onChange } = await setup({ resourceType: 'Patient' });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByText('Add Filter'));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('filter-0-field', { selector: 'input' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Name'));
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  test('A relative date expands into a start/end filter pair', async () => {
    const { onChange } = await setup({ resourceType: 'Patient' });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByText('Add Filter'));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('filter-0-field', { selector: 'input' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Birthdate'));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('filter-0-operator', { selector: 'input' }));
    });
    expect(await screen.findByText('Relative dates')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('Today'));
    });

    const lastArg = onChange.mock.calls.at(-1)?.[0] as SearchRequest;
    expect(lastArg.filters).toMatchObject([
      { code: 'birthdate', operator: Operator.GREATER_THAN_OR_EQUALS },
      { code: 'birthdate', operator: Operator.LESS_THAN_OR_EQUALS },
    ]);
    expect(screen.getByLabelText('filter-1-field', { selector: 'input' })).toHaveValue('Birthdate');
  });

  test('Non-date fields have no relative date options', async () => {
    await setup({ resourceType: 'Patient', filters: [{ code: 'name', operator: Operator.EQUALS, value: 'x' }] });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('filter-0-operator', { selector: 'input' }));
    });
    expect(screen.queryByText('Relative dates')).not.toBeInTheDocument();
  });

  test('requestFilterField opens the popover with the field preselected', async () => {
    await act(async () => {
      await medplum.requestSchema('Patient');
    });
    await act(async () => {
      render(
        wrap(
          <SearchFilterPopover
            search={{ resourceType: 'Patient' }}
            onChange={vi.fn()}
            requestFilterField={{ code: 'name', nonce: 1 }}
          />
        )
      );
    });

    expect(await screen.findByText('Add Filter')).toBeInTheDocument();
    expect(screen.getByLabelText('filter-0-field', { selector: 'input' })).toHaveValue('Name');
  });
});
