import { globalSchema } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { convertIsoToLocal } from '../DateTimeInput/DateTimeInput.utils';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { SearchFilterValueInput } from './SearchFilterValueInput';

const medplum = new MockClient();

function setup(child: ReactNode): void {
  render(<MedplumProvider medplum={medplum}>{child}</MedplumProvider>);
}

describe('SearchFilterValueInput', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Text input', async () => {
    const onChange = jest.fn();

    setup(
      <SearchFilterValueInput
        resourceType="Patient"
        searchParam={globalSchema.types['Patient'].searchParams?.['name'] as SearchParameter}
        onChange={onChange}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-value'), { target: { value: 'foo' } });
    });

    expect(onChange).toHaveBeenCalledWith('foo');
  });

  test('Boolean input', async () => {
    const onChange = jest.fn();

    setup(
      <SearchFilterValueInput
        resourceType="Patient"
        searchParam={globalSchema.types['Patient'].searchParams?.['active'] as SearchParameter}
        onChange={onChange}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('filter-value'));
    });

    expect(onChange).toHaveBeenCalledWith('true');
    onChange.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByTestId('filter-value'));
    });

    expect(onChange).toHaveBeenCalledWith('false');
    onChange.mockClear();
  });

  test('Date input', async () => {
    const onChange = jest.fn();

    setup(
      <SearchFilterValueInput
        resourceType="Patient"
        searchParam={globalSchema.types['Patient'].searchParams?.['birthdate'] as SearchParameter}
        onChange={onChange}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-value'), { target: { value: '1950-01-01' } });
    });

    expect(onChange).toHaveBeenCalledWith('1950-01-01');
  });

  test('Date/Time input', async () => {
    const isoString = '2020-01-01T00:00:00.000Z';
    const localString = convertIsoToLocal(isoString);
    const onChange = jest.fn();

    setup(
      <SearchFilterValueInput
        resourceType="Patient"
        searchParam={globalSchema.types['Patient'].searchParams?.['_lastUpdated'] as SearchParameter}
        onChange={onChange}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-value'), { target: { value: localString } });
    });

    expect(onChange).toHaveBeenCalledWith(isoString);
  });

  test('Quantity input', async () => {
    const onChange = jest.fn();

    setup(
      <SearchFilterValueInput
        resourceType="Encounter"
        searchParam={globalSchema.types['Encounter'].searchParams?.['length'] as SearchParameter}
        onChange={onChange}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: '5' } });
    });

    expect(onChange).toHaveBeenCalledWith('5');
  });

  test('Reference input', async () => {
    // Warm up the default value
    await medplum.readResource('Organization', '123');

    const onChange = jest.fn();

    setup(
      <SearchFilterValueInput
        resourceType="Patient"
        searchParam={globalSchema.types['Patient'].searchParams?.['organization'] as SearchParameter}
        defaultValue="Organization/123"
        onChange={onChange}
      />
    );

    // Wait for the resource to load
    expect(await screen.findByText('Test Organization')).toBeInTheDocument();

    // Clear the existing value
    const clearButton = screen.getByTitle('Clear all');
    await act(async () => {
      fireEvent.click(clearButton);
    });

    const input = screen.getAllByRole('searchbox')[0] as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Different' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Expect new organization selected
    expect(onChange).toHaveBeenCalledWith('Organization/456');
  });
});
