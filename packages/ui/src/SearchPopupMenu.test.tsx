import { Filter, IndexedStructureDefinition, Operator, SearchRequest } from '@medplum/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { SearchPopupMenu } from './SearchPopupMenu';

const schema: IndexedStructureDefinition = {
  types: {
    Patient: {
      display: 'Patient',
      properties: {
        name: {
          key: 'name',
          display: 'Name',
          type: 'HumanName'
        },
        birthDate: {
          key: 'birthDate',
          display: 'Birth Date',
          type: 'date'
        }
      }
    },
    Observation: {
      display: 'Observation',
      properties: {
        valueInteger: {
          key: 'valueInteger',
          display: 'Value',
          type: 'integer'
        }
      }
    }
  }
};

test('SearchPopupMenu for invalid resource', () => {
  expect(SearchPopupMenu({
    schema,
    search: { resourceType: 'xyz' },
    visible: true,
    x: 0,
    y: 0,
    field: 'name',
    onChange: (e) => console.log('onChange', e),
    onClose: () => console.log('onClose')
  })).toBeNull();
});

test('SearchPopupMenu for invalid property', () => {
  expect(SearchPopupMenu({
    schema,
    search: { resourceType: 'Patient' },
    visible: true,
    x: 0,
    y: 0,
    field: 'xyz',
    onChange: (e) => console.log('onChange', e),
    onClose: () => console.log('onClose')
  })).toBeNull();
});

test('SearchPopupMenu renders name field', () => {
  render(<SearchPopupMenu
    schema={schema}
    search={{
      resourceType: 'Patient'
    }}
    visible={true}
    x={0}
    y={0}
    field={'name'}
    onChange={e => console.log('onChange', e)}
    onClose={() => console.log('onClose')}
  />);

  expect(screen.getByText('Equals...')).not.toBeUndefined();
});

test('SearchPopupMenu renders date field', () => {
  render(<SearchPopupMenu
    schema={schema}
    search={{
      resourceType: 'Patient'
    }}
    visible={true}
    x={0}
    y={0}
    field={'birthDate'}
    onChange={e => console.log('onChange', e)}
    onClose={() => console.log('onClose')}
  />);

  expect(screen.getByText('Before...')).not.toBeUndefined();
  expect(screen.getByText('After...')).not.toBeUndefined();
});

test('SearchPopupMenu renders date field submenu', async () => {
  render(<SearchPopupMenu
    schema={schema}
    search={{
      resourceType: 'Patient'
    }}
    visible={true}
    x={0}
    y={0}
    field={'birthDate'}
    onChange={e => console.log('onChange', e)}
    onClose={() => console.log('onClose')}
  />);

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

test('SearchPopupMenu renders numeric field', () => {
  render(<SearchPopupMenu
    schema={schema}
    search={{
      resourceType: 'Observation'
    }}
    visible={true}
    x={0}
    y={0}
    field={'valueInteger'}
    onChange={e => console.log('onChange', e)}
    onClose={() => console.log('onClose')}
  />);

  expect(screen.getByText('Sort Largest to Smallest')).not.toBeUndefined();
  expect(screen.getByText('Sort Smallest to Largest')).not.toBeUndefined();
});

test('SearchPopupMenu sort', async () => {
  let currSearch: SearchRequest = {
    resourceType: 'Patient'
  };

  render(<SearchPopupMenu
    schema={schema}
    search={currSearch}
    visible={true}
    x={0}
    y={0}
    field={'birthDate'}
    onChange={e => currSearch = e}
    onClose={() => console.log('onClose')}
  />);

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

test('SearchPopupMenu text submenu prompt', async () => {
  window.prompt = jest.fn().mockImplementation(() => 'xyz');

  let currSearch: SearchRequest = {
    resourceType: 'Patient'
  };

  render(<SearchPopupMenu
    schema={schema}
    search={currSearch}
    visible={true}
    x={0}
    y={0}
    field={'name'}
    onChange={e => currSearch = e}
    onClose={() => console.log('onClose')}
  />);

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

test('SearchPopupMenu date submenu prompt', async () => {
  window.prompt = jest.fn().mockImplementation(() => 'xyz');

  let currSearch: SearchRequest = {
    resourceType: 'Patient'
  };

  render(<SearchPopupMenu
    schema={schema}
    search={currSearch}
    visible={true}
    x={0}
    y={0}
    field={'birthDate'}
    onChange={e => currSearch = e}
    onClose={() => console.log('onClose')}
  />);

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
