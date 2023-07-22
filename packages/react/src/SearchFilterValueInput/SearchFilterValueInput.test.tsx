import { globalSchema } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { convertIsoToLocal } from '../DateTimeInput/DateTimeInput';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { SearchFilterValueInput } from './SearchFilterValueInput';

const medplum = new MockClient();

function setup(child: React.ReactNode): void {
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

    expect(onChange).toBeCalledWith('foo');
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

    expect(onChange).toBeCalledWith('true');
    onChange.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByTestId('filter-value'));
    });

    expect(onChange).toBeCalledWith('false');
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

    expect(onChange).toBeCalledWith('1950-01-01');
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

    expect(onChange).toBeCalledWith(isoString);
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

    expect(onChange).toBeCalledWith('5');
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
    await act(async () => {
      await waitFor(() => screen.getByText('Test Organization'));
    });

    const input = screen.getByRole('searchbox') as HTMLInputElement;
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
