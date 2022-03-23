import { IndexedStructureDefinition } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { convertIsoToLocal } from './DateTimeInput';
import { MedplumProvider } from './MedplumProvider';
import { SearchFilterValueInput } from './SearchFilterValueInput';

const medplum = new MockClient();
let schema: IndexedStructureDefinition;

function setup(child: React.ReactNode): void {
  render(<MedplumProvider medplum={medplum}>{child}</MedplumProvider>);
}

describe('SearchFilterValueInput', () => {
  beforeAll(async () => {
    await medplum.requestSchema('Observation');
    await medplum.requestSchema('Patient');
    schema = medplum.getSchema();
  });

  beforeEach(async () => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Text input', async () => {
    const onChange = jest.fn();

    setup(
      <SearchFilterValueInput
        schema={schema}
        resourceType="Patient"
        searchParam={schema.types['Patient'].searchParams?.['name'] as SearchParameter}
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
        schema={schema}
        resourceType="Patient"
        searchParam={schema.types['Patient'].searchParams?.['active'] as SearchParameter}
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
        schema={schema}
        resourceType="Patient"
        searchParam={schema.types['Patient'].searchParams?.['birthdate'] as SearchParameter}
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
        schema={schema}
        resourceType="Patient"
        searchParam={schema.types['Patient'].searchParams?.['_lastUpdated'] as SearchParameter}
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
        schema={schema}
        resourceType="Observation"
        searchParam={schema.types['Observation'].searchParams?.['value-quantity'] as SearchParameter}
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
    await medplum.read('Organization', '123');

    const onChange = jest.fn();

    setup(
      <SearchFilterValueInput
        schema={schema}
        resourceType="Patient"
        searchParam={schema.types['Patient'].searchParams?.['organization'] as SearchParameter}
        defaultValue="Organization/123"
        onChange={onChange}
      />
    );

    // Wait for the resource to load
    await act(async () => {
      await waitFor(() => screen.getByText('Test Organization'));
    });

    const input = screen.getByTestId('input-element') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Different' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('dropdown'));
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Expect new organization selected
    expect(onChange).toHaveBeenCalledWith('Organization/456');

    // act(() => {
    //   jest.runOnlyPendingTimers();
    // });
    // jest.useRealTimers();
  });

  // test('Add filter', async () => {
  //   let currSearch: SearchRequest = {
  //     resourceType: 'Patient',
  //   };

  //   setup(
  //     <SearchFilterValueInput
  //       schema={schema}
  //       search={currSearch}
  //       visible={true}
  //       onOk={(e) => (currSearch = e)}
  //       onCancel={() => console.log('onCancel')}
  //     />
  //   );

  //   await act(async () => {
  //     fireEvent.change(screen.getByTestId('filter-field'), {
  //       target: { value: 'name' },
  //     });
  //   });

  //   await act(async () => {
  //     fireEvent.change(screen.getByTestId('filter-operation'), {
  //       target: { value: 'contains' },
  //     });
  //   });

  //   await act(async () => {
  //     fireEvent.change(screen.getByTestId('filter-value'), {
  //       target: { value: 'Alice' },
  //     });
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('Add'));
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('OK'));
  //   });

  //   expect(currSearch.filters).toMatchObject([
  //     {
  //       code: 'name',
  //       operator: Operator.CONTAINS,
  //       value: 'Alice',
  //     },
  //   ]);
  // });

  // test('Edit reference filter', async () => {
  //   let currSearch: SearchRequest = {
  //     resourceType: 'Patient',
  //     filters: [
  //       {
  //         code: 'organization',
  //         operator: Operator.EQUALS,
  //         value: 'Organization/123',
  //       },
  //     ],
  //   };

  //   setup(
  //     <SearchFilterValueInput
  //       schema={schema}
  //       search={currSearch}
  //       visible={true}
  //       onOk={(e) => (currSearch = e)}
  //       onCancel={() => console.log('onCancel')}
  //     />
  //   );

  //   // Wait for the resource to load
  //   await act(async () => {
  //     await waitFor(() => screen.getByText('Test Organization'));
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('Edit'));
  //   });

  //   const input = screen.getByTestId('input-element') as HTMLInputElement;
  //   await act(async () => {
  //     fireEvent.change(input, { target: { value: 'Different' } });
  //   });

  //   // Wait for the drop down
  //   await act(async () => {
  //     jest.advanceTimersByTime(1000);
  //     await waitFor(() => screen.getByTestId('dropdown'));
  //   });

  //   // Press "Enter"
  //   await act(async () => {
  //     fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('Save'));
  //   });

  //   // Wait for the resource to load
  //   await act(async () => {
  //     await waitFor(() => screen.getByText('Different'));
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('OK'));
  //   });

  //   expect(currSearch.filters).toMatchObject([
  //     {
  //       code: 'organization',
  //       operator: Operator.EQUALS,
  //       value: 'Organization/456',
  //     },
  //   ]);
  // });

  // test('Delete filter', async () => {
  //   let currSearch: SearchRequest = {
  //     resourceType: 'Patient',
  //     filters: [
  //       {
  //         code: 'name',
  //         operator: Operator.CONTAINS,
  //         value: 'Alice',
  //       },
  //     ],
  //   };

  //   setup(
  //     <SearchFilterValueInput
  //       schema={schema}
  //       search={currSearch}
  //       visible={true}
  //       onOk={(e) => (currSearch = e)}
  //       onCancel={() => console.log('onCancel')}
  //     />
  //   );

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('Delete'));
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('OK'));
  //   });

  //   expect(currSearch.filters?.length).toEqual(0);
  // });

  // test('Edit filter', async () => {
  //   let currSearch: SearchRequest = {
  //     resourceType: 'Patient',
  //     filters: [
  //       {
  //         code: 'name',
  //         operator: Operator.CONTAINS,
  //         value: 'Alice',
  //       },
  //     ],
  //   };

  //   setup(
  //     <SearchFilterValueInput
  //       schema={schema}
  //       search={currSearch}
  //       visible={true}
  //       onOk={(e) => (currSearch = e)}
  //       onCancel={() => console.log('onCancel')}
  //     />
  //   );

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('Edit'));
  //   });

  //   await act(async () => {
  //     fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Bob' } });
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('Save'));
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('OK'));
  //   });

  //   expect(currSearch.filters?.length).toEqual(1);
  //   expect(currSearch.filters?.[0]?.value).toEqual('Bob');
  // });

  // test('Cancel edit', async () => {
  //   let currSearch: SearchRequest = {
  //     resourceType: 'Patient',
  //     filters: [
  //       {
  //         code: 'name',
  //         operator: Operator.CONTAINS,
  //         value: 'Alice',
  //       },
  //     ],
  //   };

  //   setup(
  //     <SearchFilterValueInput
  //       schema={schema}
  //       search={currSearch}
  //       visible={true}
  //       onOk={(e) => (currSearch = e)}
  //       onCancel={() => console.log('onCancel')}
  //     />
  //   );

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('Edit'));
  //   });

  //   await act(async () => {
  //     fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Bob' } });
  //   });

  //   await act(async () => {
  //     // There are 2 cancel buttons
  //     // First one for the row
  //     // Second one for the dialog overall
  //     // Click on the first one
  //     fireEvent.click(screen.getAllByText('Cancel')[0]);
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('OK'));
  //   });

  //   expect(currSearch.filters?.length).toEqual(1);
  //   expect(currSearch.filters?.[0]?.value).toEqual('Alice');
  // });

  // test('Handle unknown search param type', async () => {
  //   let currSearch: SearchRequest = {
  //     resourceType: 'Patient',
  //     filters: [
  //       {
  //         code: 'not-a-code',
  //         operator: Operator.EQUALS,
  //         value: 'foo',
  //       },
  //     ],
  //   };

  //   setup(
  //     <SearchFilterValueInput
  //       schema={schema}
  //       search={currSearch}
  //       visible={true}
  //       onOk={(e) => (currSearch = e)}
  //       onCancel={() => console.log('onCancel')}
  //     />
  //   );

  //   expect(screen.getByText('Not A Code')).toBeInTheDocument();

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('Edit'));
  //   });

  //   expect(screen.queryByDisplayValue('not-a-code')).not.toBeInTheDocument();
  // });

  // test('_lastUpdated filter', async () => {
  //   let currSearch: SearchRequest = {
  //     resourceType: 'Patient',
  //     fields: ['id', 'name'],
  //     filters: [
  //       {
  //         code: '_lastUpdated',
  //         operator: Operator.GREATER_THAN_OR_EQUALS,
  //         value: '2022-01-01T00:00:00.000Z',
  //       },
  //     ],
  //   };

  //   setup(
  //     <SearchFilterValueInput
  //       schema={schema}
  //       search={currSearch}
  //       visible={true}
  //       onOk={(e) => (currSearch = e)}
  //       onCancel={() => console.log('onCancel')}
  //     />
  //   );

  //   // Wait for the resource to load
  //   await act(async () => {
  //     await waitFor(() => screen.queryAllByText('Last Updated').length > 0);
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('Edit'));
  //   });

  //   const input = screen.getByTestId('filter-value') as HTMLInputElement;
  //   expect(input.value).toMatch(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  // });
});
