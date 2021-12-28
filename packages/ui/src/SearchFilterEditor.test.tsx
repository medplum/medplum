import { IndexedStructureDefinition, Operator, SearchRequest } from '@medplum/core';
import { Bundle, Organization } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';
import { SearchFilterEditor } from './SearchFilterEditor';

const schema: IndexedStructureDefinition = {
  types: {
    Patient: {
      display: 'Patient',
      properties: {
        name: {
          id: 'Patient.name',
          path: 'Patient.name',
          type: [
            {
              code: 'HumanName',
            },
          ],
        },
        birthDate: {
          id: 'Patient.birthDate',
          path: 'Patient.birthDate',
          type: [
            {
              code: 'date',
            },
          ],
        },
      },
      searchParams: [
        {
          resourceType: 'SearchParameter',
          code: 'name',
          type: 'string',
        },
        {
          resourceType: 'SearchParameter',
          code: 'birthdate',
          type: 'date',
        },
        {
          resourceType: 'SearchParameter',
          code: 'organization',
          type: 'reference',
        },
      ],
    },
    Observation: {
      display: 'Observation',
      properties: {
        valueInteger: {
          id: 'Observation.value[x]',
          path: 'Observation.value[x]',
          type: [
            {
              code: 'integer',
            },
          ],
        },
      },
      searchParams: [
        {
          resourceType: 'SearchParameter',
          code: 'subject',
          type: 'reference',
        },
      ],
    },
  },
};

const organization: Organization = {
  resourceType: 'Organization',
  id: '123',
  meta: {
    versionId: '1',
  },
  name: 'Test Organization',
};

const differentOrganization: Organization = {
  resourceType: 'Organization',
  id: '456',
  meta: {
    versionId: '1',
  },
  name: 'Different',
};

const searchBundle: Bundle<Organization> = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [
    {
      resource: differentOrganization,
    },
  ],
};

const medplum = new MockClient({
  'fhir/R4/Organization/123': {
    GET: organization,
  },
  'fhir/R4/Organization/456': {
    GET: differentOrganization,
  },
  'fhir/R4/Organization?name=Different': {
    GET: searchBundle,
  },
});

const setup = (child: React.ReactNode) => {
  return render(<MedplumProvider medplum={medplum}>{child}</MedplumProvider>);
};

describe('SearchFilterEditor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Not visible', () => {
    setup(
      <SearchFilterEditor
        schema={schema}
        search={{ resourceType: 'Patient' }}
        visible={false}
        onOk={jest.fn()}
        onCancel={jest.fn()}
      />
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

    setup(
      <SearchFilterEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-field'), {
        target: { value: 'name' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-operation'), {
        target: { value: 'contains' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-value'), {
        target: { value: 'Alice' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add'));
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
          value: 'Organization/123',
        },
      ],
    };

    setup(
      <SearchFilterEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    // Wait for the resource to load
    await act(async () => {
      await waitFor(() => screen.getByText('Test Organization'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
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

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    // Wait for the resource to load
    await act(async () => {
      await waitFor(() => screen.getByText('Different'));
    });

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

    setup(
      <SearchFilterEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
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

    setup(
      <SearchFilterEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Bob' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.filters?.length).toEqual(1);
    expect(currSearch.filters?.[0]?.value).toEqual('Bob');
  });

  test('Cancel edit', async () => {
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

    setup(
      <SearchFilterEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Bob' } });
    });

    await act(async () => {
      // There are 2 cancel buttons
      // First one for the row
      // Second one for the dialog overall
      // Click on the first one
      fireEvent.click(screen.getAllByText('Cancel')[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.filters?.length).toEqual(1);
    expect(currSearch.filters?.[0]?.value).toEqual('Alice');
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

    setup(
      <SearchFilterEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    expect(screen.getByText('not-a-code')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(screen.queryByDisplayValue('not-a-code')).not.toBeInTheDocument();
  });
});
