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
  await screen.findByText('Add condition');
}

describe('SearchFilterPopover', () => {
  test('Renders trigger and opens', async () => {
    await setup({ resourceType: 'Patient' });
    await openPopover();
    expect(screen.getByText('No filters applied')).toBeInTheDocument();
    expect(screen.getByText('Add condition')).toBeInTheDocument();
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

  test('Add condition adds an empty row', async () => {
    await setup({ resourceType: 'Patient' });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByText('Add condition'));
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
      fireEvent.click(screen.getByText('Add condition'));
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

    expect(await screen.findByText('Add condition')).toBeInTheDocument();
    expect(screen.getByLabelText('filter-0-field', { selector: 'input' })).toHaveValue('Name');
  });
});
