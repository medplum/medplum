// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter, SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { SearchFilterPopoverProps } from './SearchFilterPopover';
import { SearchFilterPopover } from './SearchFilterPopover';

const medplum = new MockClient();

const nameFilter: Filter = { code: 'name', operator: Operator.EQUALS, value: 'Simpson' };
const genderFilter: Filter = { code: 'gender', operator: Operator.EQUALS, value: 'male' };

async function setup(
  search: SearchRequest,
  extraProps: Partial<SearchFilterPopoverProps> = {}
): Promise<{ onChange: ReturnType<typeof vi.fn> }> {
  const onChange = vi.fn();
  await act(async () => {
    await medplum.requestSchema(search.resourceType);
  });
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <SearchFilterPopover search={search} onChange={onChange} {...extraProps} />
      </MedplumProvider>
    );
  });
  return { onChange };
}

async function openPopover(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByText('Filters'));
  });
  await screen.findByText('Add Filter');
}

function lastFilters(onChange: ReturnType<typeof vi.fn>): Filter[] | undefined {
  return (onChange.mock.calls.at(-1)?.[0] as SearchRequest).filters;
}

describe('SearchFilterPopover', () => {
  test.each<[Filter[] | undefined, string | undefined]>([
    [undefined, undefined],
    [[nameFilter], '1 Filter Applied'],
    [[nameFilter, genderFilter], '2 Filters Applied'],
  ])('Description for filters %j', async (filters, description) => {
    await setup({ resourceType: 'Patient', filters });
    const button = screen.getByRole('button', { name: 'Filters' });
    if (description) {
      expect(button).toHaveAccessibleDescription(description);
    } else {
      expect(button).not.toHaveAttribute('aria-describedby');
    }
  });

  test('Opens showing the existing conditions', async () => {
    await setup({ resourceType: 'Patient', filters: [nameFilter] });
    await openPopover();
    expect(screen.getByText('Where')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter 1 field', { selector: 'input' })).toHaveValue('Name');
    expect(screen.getByTestId('filter-0-value')).toHaveValue('Simpson');
  });

  test('Building a condition emits only once it is complete', async () => {
    const { onChange } = await setup({ resourceType: 'Patient' });
    await openPopover();
    await act(async () => {
      fireEvent.click(screen.getByText('Add Filter'));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Filter 1 field', { selector: 'input' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Name'));
    });
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Filter 1 operator', { selector: 'input' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('contains'));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-0-value'), { target: { value: 'Simpson' } });
    });
    expect(lastFilters(onChange)).toMatchObject([{ code: 'name', operator: Operator.CONTAINS, value: 'Simpson' }]);
  });

  test('Numeric fields support comparison operators', async () => {
    const { onChange } = await setup({
      resourceType: 'RiskAssessment',
      filters: [{ code: 'probability', operator: Operator.EQUALS, value: '0.1' }],
    });
    await openPopover();
    const operatorInput = screen.getByLabelText('Filter 1 operator', { selector: 'input' });
    expect(operatorInput).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(operatorInput);
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('option', { name: 'greater than', hidden: true }));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-0-value'), { target: { value: '0.5' } });
    });
    expect(lastFilters(onChange)).toEqual([{ code: 'probability', operator: Operator.GREATER_THAN, value: '0.5' }]);
  });

  test('Removing a row emits the rest and keeps the next row showing its own value', async () => {
    const { onChange } = await setup({
      resourceType: 'Patient',
      filters: [
        { code: 'name', operator: Operator.EQUALS, value: 'Smith' },
        { code: 'name', operator: Operator.EQUALS, value: 'Jones' },
      ],
    });
    await openPopover();
    expect(screen.getByTestId('filter-0-value')).toHaveValue('Smith');
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove filter 1'));
    });
    expect(lastFilters(onChange)).toEqual([{ code: 'name', operator: Operator.EQUALS, value: 'Jones' }]);
    expect(screen.getByTestId('filter-0-value')).toHaveValue('Jones');
  });

  test('requestFilterField opens the popover with the field preselected', async () => {
    await setup({ resourceType: 'Patient' }, { requestFilterField: { code: 'name', nonce: 1 } });
    expect(await screen.findByText('Add Filter')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter 1 field', { selector: 'input' })).toHaveValue('Name');
  });
});
