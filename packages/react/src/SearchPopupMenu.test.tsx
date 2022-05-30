import { Filter, IndexedStructureDefinition, Operator, SearchRequest } from '@medplum/core';
import { MockClient, PatientSearchParameters } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { getFieldDefinitions } from './SearchControlField';
import { SearchPopupMenu, SearchPopupMenuProps } from './SearchPopupMenu';

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
      searchParams: Object.fromEntries(PatientSearchParameters.map((p) => [p.code, p])),
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
      searchParams: {
        'value-quantity': {
          resourceType: 'SearchParameter',
          code: 'value-quantity',
          type: 'quantity',
        },
      },
    },
  },
};

const medplum = new MockClient();

describe('SearchPopupMenu', () => {
  function setup(partialProps: Partial<SearchPopupMenuProps>): void {
    const props = {
      schema,
      visible: true,
      x: 0,
      y: 0,
      onPrompt: jest.fn(),
      onChange: jest.fn(),
      onClose: jest.fn(),
      ...partialProps,
    } as SearchPopupMenuProps;

    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <SearchPopupMenu {...props} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Invalid resource', () => {
    setup({
      search: { resourceType: 'xyz' },
    });
  });

  test('Invalid property', () => {
    setup({
      search: { resourceType: 'Patient' },
    });
  });

  test('Renders name field', () => {
    setup({
      search: {
        resourceType: 'Patient',
      },
      searchParam: schema.types['Patient']?.searchParams?.['name'],
    });

    expect(screen.getByText('Equals...')).toBeDefined();
  });

  test('Renders date field', () => {
    setup({
      search: {
        resourceType: 'Patient',
      },
      searchParam: schema.types['Patient']?.searchParams?.['birthdate'],
    });

    expect(screen.getByText('Before...')).toBeDefined();
    expect(screen.getByText('After...')).toBeDefined();
  });

  test('Renders date field submenu', async () => {
    setup({
      search: {
        resourceType: 'Patient',
      },
      searchParam: schema.types['Patient']?.searchParams?.['birthdate'],
    });

    expect(screen.getByText('Before...')).toBeDefined();
    expect(screen.getByText('After...')).toBeDefined();

    const dateFiltersSubmenu = screen.getByText('Date filters');

    await act(async () => {
      fireEvent.click(dateFiltersSubmenu);
    });

    expect(screen.getByText('Tomorrow')).toBeDefined();
    expect(screen.getByText('Today')).toBeDefined();
    expect(screen.getByText('Yesterday')).toBeDefined();
  });

  test('Renders numeric field', () => {
    setup({
      search: {
        resourceType: 'Observation',
      },
      searchParam: schema.types['Observation']?.searchParams?.['value-quantity'],
    });

    expect(screen.getByText('Sort Largest to Smallest')).toBeDefined();
    expect(screen.getByText('Sort Smallest to Largest')).toBeDefined();
  });

  test('Sort', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    setup({
      search: currSearch,
      searchParam: schema.types['Patient']?.searchParams?.['birthdate'],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sort Oldest to Newest'));
    });

    expect(currSearch.sortRules).toBeDefined();
    expect(currSearch.sortRules?.length).toEqual(1);
    expect(currSearch.sortRules?.[0].code).toEqual('birthdate');
    expect(currSearch.sortRules?.[0].descending).toEqual(false);

    await act(async () => {
      fireEvent.click(screen.getByText('Sort Newest to Oldest'));
    });

    expect(currSearch.sortRules).toBeDefined();
    expect(currSearch.sortRules?.length).toEqual(1);
    expect(currSearch.sortRules?.[0].code).toEqual('birthdate');
    expect(currSearch.sortRules?.[0].descending).toEqual(true);
  });

  test('Clear filters', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice',
        },
      ],
    };

    setup({
      search: currSearch,
      searchParam: schema.types['Patient']?.searchParams?.['name'],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Clear filters'));
    });

    expect(currSearch.filters?.length).toEqual(0);
  });

  test('Text submenu prompt', async () => {
    const onPrompt = jest.fn();

    setup({
      search: {
        resourceType: 'Patient',
      },
      searchParam: schema.types['Patient']?.searchParams?.['name'],
      onPrompt,
    });

    const options = [
      { text: 'Equals...', operator: Operator.EQUALS },
      { text: 'Does not equal...', operator: Operator.NOT_EQUALS },
      { text: 'Contains...', operator: Operator.CONTAINS },
      { text: 'Does not contain...', operator: Operator.EQUALS },
    ];

    for (const option of options) {
      onPrompt.mockClear();

      await act(async () => {
        fireEvent.click(screen.getByText(option.text));
      });

      expect(onPrompt).toBeCalledWith({
        code: 'name',
        operator: option.operator,
        value: '',
      } as Filter);
    }
  });

  test('Text search prompt', async () => {
    const onPrompt = jest.fn();

    setup({
      search: {
        resourceType: 'Patient',
      },
      searchParam: schema.types['Patient']?.searchParams?.['name'],
      onPrompt,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Search'));
    });

    expect(onPrompt).toBeCalledWith({
      code: 'name',
      operator: Operator.CONTAINS,
      value: '',
    } as Filter);
  });

  test('Date submenu prompt', async () => {
    const onPrompt = jest.fn();

    setup({
      search: {
        resourceType: 'Patient',
      },
      searchParam: schema.types['Patient']?.searchParams?.['birthdate'],
      onPrompt,
    });

    const options = [
      { text: 'Equals...', operator: Operator.EQUALS },
      { text: 'Does not equal...', operator: Operator.NOT_EQUALS },
      { text: 'Before...', operator: Operator.ENDS_BEFORE },
      { text: 'After...', operator: Operator.STARTS_AFTER },
      { text: 'Between...', operator: Operator.EQUALS },
      { text: 'Is set', operator: Operator.EQUALS },
      { text: 'Is not set', operator: Operator.EQUALS },
    ];

    for (const option of options) {
      onPrompt.mockClear();

      await act(async () => {
        fireEvent.click(screen.getByText(option.text));
      });

      expect(onPrompt).toBeCalledWith({
        code: 'birthdate',
        operator: option.operator,
        value: '',
      } as Filter);
    }
  });

  test('Date shortcuts', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    setup({
      search: currSearch,
      searchParam: schema.types['Patient']?.searchParams?.['birthdate'],
      onChange: (e) => (currSearch = e),
    });

    const options = ['Tomorrow', 'Today', 'Yesterday', 'Next Month', 'This Month', 'Last Month', 'Year to date'];
    for (const option of options) {
      await act(async () => {
        fireEvent.click(screen.getByText(option));
      });

      expect(currSearch.filters).toBeDefined();
      expect(currSearch.filters?.length).toEqual(2);
      expect(currSearch.filters).toMatchObject([
        {
          code: 'birthdate',
          operator: Operator.GREATER_THAN_OR_EQUALS,
        },
        {
          code: 'birthdate',
          operator: Operator.LESS_THAN_OR_EQUALS,
        },
      ]);
    }
  });

  test('Renders meta.versionId', () => {
    const search = {
      resourceType: 'Patient',
      fields: ['meta.versionId'],
    };

    const fields = getFieldDefinitions(schema, search);

    setup({
      search,
      searchParam: fields[0].searchParam,
    });

    expect(screen.getByText('Equals...')).toBeDefined();
  });

  test('Renders _lastUpdated', () => {
    const search = {
      resourceType: 'Patient',
      fields: ['_lastUpdated'],
    };

    const fields = getFieldDefinitions(schema, search);

    setup({
      search: {
        resourceType: 'Patient',
      },
      searchParam: fields[0].searchParam,
    });

    expect(screen.getByText('Before...')).toBeDefined();
    expect(screen.getByText('After...')).toBeDefined();
  });
});
