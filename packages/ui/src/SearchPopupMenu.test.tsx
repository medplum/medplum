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
  function setup(props: SearchPopupMenuProps): void {
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
      schema,
      search: { resourceType: 'xyz' },
      visible: true,
      x: 0,
      y: 0,
      onClose: jest.fn(),
    });
  });

  test('Invalid property', () => {
    setup({
      schema,
      search: { resourceType: 'Patient' },
      visible: true,
      x: 0,
      y: 0,
      onClose: jest.fn(),
    });
  });

  test('Renders name field', () => {
    setup({
      schema,
      search: {
        resourceType: 'Patient',
      },
      visible: true,
      x: 0,
      y: 0,
      searchParam: schema.types['Patient']?.searchParams?.['name'],
      onClose: jest.fn(),
    });

    expect(screen.getByText('Equals...')).toBeDefined();
  });

  test('Renders date field', () => {
    setup({
      schema,
      search: {
        resourceType: 'Patient',
      },
      visible: true,
      x: 0,
      y: 0,
      searchParam: schema.types['Patient']?.searchParams?.['birthdate'],
      onClose: jest.fn(),
    });

    expect(screen.getByText('Before...')).toBeDefined();
    expect(screen.getByText('After...')).toBeDefined();
  });

  test('Renders date field submenu', async () => {
    setup({
      schema,
      search: {
        resourceType: 'Patient',
      },
      visible: true,
      x: 0,
      y: 0,
      searchParam: schema.types['Patient']?.searchParams?.['birthdate'],
      onClose: jest.fn(),
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
      schema,
      search: {
        resourceType: 'Observation',
      },
      visible: true,
      x: 0,
      y: 0,
      searchParam: schema.types['Observation']?.searchParams?.['value-quantity'],
      onClose: jest.fn(),
    });

    expect(screen.getByText('Sort Largest to Smallest')).toBeDefined();
    expect(screen.getByText('Sort Smallest to Largest')).toBeDefined();
  });

  test('Sort', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    setup({
      schema,
      search: currSearch,
      visible: true,
      x: 0,
      y: 0,
      searchParam: schema.types['Patient']?.searchParams?.['birthdate'],
      onChange: (e) => (currSearch = e),
      onClose: jest.fn(),
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
      schema,
      search: currSearch,
      visible: true,
      x: 0,
      y: 0,
      searchParam: schema.types['Patient']?.searchParams?.['name'],
      onChange: (e) => (currSearch = e),
      onClose: jest.fn(),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Clear filters'));
    });

    expect(currSearch.filters?.length).toEqual(0);
  });

  test('Text submenu prompt', async () => {
    window.prompt = jest.fn().mockImplementation(() => 'xyz');

    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    setup({
      schema,
      search: currSearch,
      visible: true,
      x: 0,
      y: 0,
      searchParam: schema.types['Patient']?.searchParams?.['name'],
      onChange: (e) => (currSearch = e),
      onClose: jest.fn(),
    });

    const options = [
      { text: 'Equals...', operator: Operator.EQUALS },
      { text: 'Does not equal...', operator: Operator.NOT_EQUALS },
      { text: 'Contains...', operator: Operator.CONTAINS },
      { text: 'Does not contain...', operator: Operator.EQUALS },
    ];

    for (const option of options) {
      await act(async () => {
        fireEvent.click(screen.getByText(option.text));
      });

      expect(currSearch.filters).toBeDefined();
      expect(currSearch.filters?.length).toEqual(1);
      expect(currSearch.filters?.[0]).toMatchObject({
        code: 'name',
        operator: option.operator,
        value: 'xyz',
      } as Filter);
    }
  });

  test('Text search prompt', async () => {
    window.prompt = jest.fn().mockImplementation(() => 'xyz');

    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    setup({
      schema,
      search: currSearch,
      visible: true,
      x: 0,
      y: 0,
      searchParam: schema.types['Patient']?.searchParams?.['name'],
      onChange: (e) => (currSearch = e),
      onClose: jest.fn(),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Search'));
    });

    expect(currSearch.filters).toBeDefined();
    expect(currSearch.filters?.length).toEqual(1);
    expect(currSearch.filters?.[0]).toMatchObject({
      code: 'name',
      operator: Operator.CONTAINS,
      value: 'xyz',
    } as Filter);
  });

  test('Date submenu prompt', async () => {
    window.prompt = jest.fn().mockImplementation(() => 'xyz');

    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    setup({
      schema,
      search: currSearch,
      visible: true,
      x: 0,
      y: 0,
      searchParam: schema.types['Patient']?.searchParams?.['birthdate'],
      onChange: (e) => (currSearch = e),
      onClose: jest.fn(),
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
      await act(async () => {
        fireEvent.click(screen.getByText(option.text));
      });

      expect(currSearch.filters).toBeDefined();
      expect(currSearch.filters?.length).toEqual(1);
      expect(currSearch.filters?.[0]).toMatchObject({
        code: 'birthdate',
        operator: option.operator,
        value: 'xyz',
      } as Filter);
    }
  });

  test('Date shortcuts', async () => {
    window.prompt = jest.fn().mockImplementation(() => 'xyz');

    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    setup({
      schema,
      search: currSearch,
      visible: true,
      x: 0,
      y: 0,
      searchParam: schema.types['Patient']?.searchParams?.['birthdate'],
      onChange: (e) => (currSearch = e),
      onClose: jest.fn(),
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
      schema,
      search,
      visible: true,
      x: 0,
      y: 0,
      searchParam: fields[0].searchParam,
      onClose: jest.fn(),
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
      schema,
      search: {
        resourceType: 'Patient',
      },
      visible: true,
      x: 0,
      y: 0,
      searchParam: fields[0].searchParam,
      onClose: jest.fn(),
    });

    expect(screen.getByText('Before...')).toBeDefined();
    expect(screen.getByText('After...')).toBeDefined();
  });
});
