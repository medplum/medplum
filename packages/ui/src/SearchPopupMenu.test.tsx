import { Filter, IndexedStructureDefinition, MedplumClient, Operator, SearchRequest } from '@medplum/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { SearchPopupMenu, SearchPopupMenuProps } from './SearchPopupMenu';

const schema: IndexedStructureDefinition = {
  types: {
    Patient: {
      display: 'Patient',
      properties: {
        name: {
          id: 'Patient.name',
          path: 'Patient.name',
          type: [{
            code: 'HumanName'
          }]
        },
        birthDate: {
          id: 'Patient.birthDate',
          path: 'Patient.birthDate',
          type: [{
            code: 'date'
          }]
        }
      }
    },
    Observation: {
      display: 'Observation',
      properties: {
        valueInteger: {
          id: 'Observation.value[x]',
          path: 'Observation.value[x]',
          type: [{
            code: 'integer'
          }]
        }
      }
    }
  }
};

describe('SearchPopupMenu', () => {

  const mockRouter = {
    push: (path: string, state: any) => {
      console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
    },
    listen: () => (() => undefined) // Return mock "unlisten" handler
  }

  function mockFetch(url: string, options: any): Promise<any> {
    const response: any = {
      request: {
        url,
        options
      }
    };

    return Promise.resolve({
      json: () => Promise.resolve(response)
    });
  }

  const medplum = new MedplumClient({
    baseUrl: 'https://example.com/',
    clientId: 'my-client-id',
    fetch: mockFetch
  });

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  function setup(props: SearchPopupMenuProps) {
    return render(
      <MedplumProvider medplum={medplum} router={mockRouter}>
        <SearchPopupMenu {...props} />
      </MedplumProvider>
    );
  }

  test('Invalid resource', () => {
    setup({
      schema,
      search: { resourceType: 'xyz' },
      visible: true,
      x: 0,
      y: 0,
      property: 'name',
      onClose: jest.fn()
    });
  });

  test('Invalid property', () => {
    setup({
      schema,
      search: { resourceType: 'Patient' },
      visible: true,
      x: 0,
      y: 0,
      property: 'xyz',
      onClose: jest.fn()
    });
  });

  test('Renders name field', () => {
    setup({
      schema,
      search: {
        resourceType: 'Patient'
      },
      visible: true,
      x: 0,
      y: 0,
      property: 'name',
      onClose: jest.fn()
    });

    expect(screen.getByText('Equals...')).not.toBeUndefined();
  });

  test('Renders date field', () => {
    setup({
      schema,
      search: {
        resourceType: 'Patient'
      },
      visible: true,
      x: 0,
      y: 0,
      property: 'birthDate',
      onClose: jest.fn()
    });

    expect(screen.getByText('Before...')).not.toBeUndefined();
    expect(screen.getByText('After...')).not.toBeUndefined();
  });

  test('Renders date field submenu', async () => {
    setup({
      schema,
      search: {
        resourceType: 'Patient'
      },
      visible: true,
      x: 0,
      y: 0,
      property: 'birthDate',
      onClose: jest.fn()
    });

    expect(screen.getByText('Before...')).not.toBeUndefined();
    expect(screen.getByText('After...')).not.toBeUndefined();

    const dateFiltersSubmenu = screen.getByText('Date filters');

    await act(async () => {
      fireEvent.click(dateFiltersSubmenu);
    });

    expect(screen.getByText('Tomorrow')).not.toBeUndefined();
    expect(screen.getByText('Today')).not.toBeUndefined();
    expect(screen.getByText('Yesterday')).not.toBeUndefined();
  });

  test('Renders numeric field', () => {
    setup({
      schema,
      search: {
        resourceType: 'Observation'
      },
      visible: true,
      x: 0,
      y: 0,
      property: 'valueInteger',
      onClose: jest.fn()
    });

    expect(screen.getByText('Sort Largest to Smallest')).not.toBeUndefined();
    expect(screen.getByText('Sort Smallest to Largest')).not.toBeUndefined();
  });

  test('Sort', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient'
    };

    setup({
      schema,
      search: currSearch,
      visible: true,
      x: 0,
      y: 0,
      property: 'birthDate',
      onChange: (e) => currSearch = e,
      onClose: jest.fn()
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sort Oldest to Newest'));
    });

    expect(currSearch.sortRules).not.toBeUndefined();
    expect(currSearch.sortRules?.length).toEqual(1);
    expect(currSearch.sortRules?.[0].code).toEqual('birthDate');
    expect(currSearch.sortRules?.[0].descending).toEqual(false);

    await act(async () => {
      fireEvent.click(screen.getByText('Sort Newest to Oldest'));
    });

    expect(currSearch.sortRules).not.toBeUndefined();
    expect(currSearch.sortRules?.length).toEqual(1);
    expect(currSearch.sortRules?.[0].code).toEqual('birthDate');
    expect(currSearch.sortRules?.[0].descending).toEqual(true);
  });

  test('Clear filters', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      filters: [{
        code: 'name',
        operator: Operator.EQUALS,
        value: 'Alice'
      }]
    };

    setup({
      schema,
      search: currSearch,
      visible: true,
      x: 0,
      y: 0,
      property: 'name',
      onChange: (e) => currSearch = e,
      onClose: jest.fn()
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Clear filters'));
    });

    expect(currSearch.filters?.length).toEqual(0);
  });

  test('Text submenu prompt', async () => {
    window.prompt = jest.fn().mockImplementation(() => 'xyz');

    let currSearch: SearchRequest = {
      resourceType: 'Patient'
    };

    setup({
      schema,
      search: currSearch,
      visible: true,
      x: 0,
      y: 0,
      property: 'name',
      onChange: (e) => currSearch = e,
      onClose: jest.fn()
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

      expect(currSearch.filters).not.toBeUndefined();
      expect(currSearch.filters?.length).toEqual(1);
      expect(currSearch.filters?.[0]).toMatchObject({
        code: 'name',
        operator: option.operator,
        value: 'xyz'
      } as Filter);
    }

  });

  test('Date submenu prompt', async () => {
    window.prompt = jest.fn().mockImplementation(() => 'xyz');

    let currSearch: SearchRequest = {
      resourceType: 'Patient'
    };

    setup({
      schema,
      search: currSearch,
      visible: true,
      x: 0,
      y: 0,
      property: 'birthDate',
      onChange: (e) => currSearch = e,
      onClose: jest.fn()
    });

    const options = [
      { text: 'Equals...', operator: Operator.EQUALS },
      { text: 'Does not equal...', operator: Operator.NOT_EQUALS },
      { text: 'Before...', operator: Operator.ENDS_BEFORE },
      { text: 'After...', operator: Operator.STARTS_AFTER },
      { text: 'Between...', operator: Operator.EQUALS },
      { text: 'Tomorrow', operator: Operator.EQUALS },
      { text: 'Today', operator: Operator.EQUALS },
      { text: 'Yesterday', operator: Operator.EQUALS },
      { text: 'Next Month', operator: Operator.EQUALS },
      { text: 'This Month', operator: Operator.EQUALS },
      { text: 'Last Month', operator: Operator.EQUALS },
      { text: 'Year to date', operator: Operator.EQUALS },
      { text: 'Is set', operator: Operator.EQUALS },
      { text: 'Is not set', operator: Operator.EQUALS },
    ];

    for (const option of options) {
      await act(async () => {
        fireEvent.click(screen.getByText(option.text));
      });

      expect(currSearch.filters).not.toBeUndefined();
      expect(currSearch.filters?.length).toEqual(1);
      expect(currSearch.filters?.[0]).toMatchObject({
        code: 'birthDate',
        operator: option.operator,
        value: 'xyz'
      } as Filter);
    }

  });

  test('Renders meta.versionId', () => {
    setup({
      schema,
      search: {
        resourceType: 'Patient'
      },
      visible: true,
      x: 0,
      y: 0,
      property: 'meta.versionId',
      onClose: jest.fn()
    });

    expect(screen.getByText('Equals...')).not.toBeUndefined();
  });

  test('Renders _lastUpdated', () => {
    setup({
      schema,
      search: {
        resourceType: 'Patient'
      },
      visible: true,
      x: 0,
      y: 0,
      property: '_lastUpdated',
      onClose: jest.fn()
    });

    expect(screen.getByText('Before...')).not.toBeUndefined();
    expect(screen.getByText('After...')).not.toBeUndefined();
  });

});