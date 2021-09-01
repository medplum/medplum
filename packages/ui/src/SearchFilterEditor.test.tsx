import { IndexedStructureDefinition, Operator, SearchRequest } from '@medplum/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { SearchFilterEditor } from './SearchFilterEditor';

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
      },
      searchParams: [{
        resourceType: 'SearchParameter',
        code: 'name',
        type: 'string'
      },
      {
        resourceType: 'SearchParameter',
        code: 'birthdate',
        type: 'date'
      }]
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
      },
      searchParams: [{
        resourceType: 'SearchParameter',
        code: 'subject',
        type: 'reference'
      }]
    }
  }
};

describe('SearchFilterEditor', () => {

  test('Add filter', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient'
    };

    render(<SearchFilterEditor
      schema={schema}
      search={currSearch}
      visible={true}
      onOk={e => currSearch = e}
      onCancel={() => console.log('onCancel')}
    />);

    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-field'), { target: { value: 'name' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-operation'), { target: { value: 'contains' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-value'), { target: { value: 'Alice' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.filters).toMatchObject([{
      code: 'name',
      operator: Operator.CONTAINS,
      value: 'Alice'
    }]);
  });

  test('Delete filter', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      filters: [{
        code: 'name',
        operator: Operator.CONTAINS,
        value: 'Alice'
      }]
    };

    render(<SearchFilterEditor
      schema={schema}
      search={currSearch}
      visible={true}
      onOk={e => currSearch = e}
      onCancel={() => console.log('onCancel')}
    />);

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.filters?.length).toEqual(0);
  });

  // test('Add field with Enter key', async () => {
  //   window.prompt = jest.fn().mockImplementation(() => 'xyz');

  //   let currSearch: SearchRequest = {
  //     resourceType: 'Patient',
  //     fields: ['name']
  //   };

  //   const utils = render(<SearchFilterEditor
  //     schema={schema}
  //     search={currSearch}
  //     visible={true}
  //     onOk={e => currSearch = e}
  //     onCancel={() => console.log('onCancel')}
  //   />);

  //   await act(async () => {
  //     (utils.getByTestId('available') as HTMLSelectElement).value = 'birthDate';
  //   });

  //   await act(async () => {
  //     fireEvent.keyDown(screen.getByTestId('available'), { key: 'Enter', code: 'Enter' });
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('OK'));
  //   });

  //   expect(currSearch.fields).toMatchObject(['name', 'birthDate']);
  // });

  // test('Remove field with Remove button', async () => {
  //   window.prompt = jest.fn().mockImplementation(() => 'xyz');

  //   let currSearch: SearchRequest = {
  //     resourceType: 'Patient',
  //     fields: ['name', 'birthDate']
  //   };

  //   const utils = render(<SearchFilterEditor
  //     schema={schema}
  //     search={currSearch}
  //     visible={true}
  //     onOk={e => currSearch = e}
  //     onCancel={() => console.log('onCancel')}
  //   />);

  //   await act(async () => {
  //     (utils.getByTestId('selected') as HTMLSelectElement).value = 'birthDate';
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('Remove'));
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('OK'));
  //   });

  //   expect(currSearch.fields).toMatchObject(['name']);
  // });

  // test('Remove field with Remove button', async () => {
  //   window.prompt = jest.fn().mockImplementation(() => 'xyz');

  //   let currSearch: SearchRequest = {
  //     resourceType: 'Patient',
  //     fields: ['name', 'birthDate']
  //   };

  //   const utils = render(<SearchFilterEditor
  //     schema={schema}
  //     search={currSearch}
  //     visible={true}
  //     onOk={e => currSearch = e}
  //     onCancel={() => console.log('onCancel')}
  //   />);

  //   await act(async () => {
  //     (utils.getByTestId('selected') as HTMLSelectElement).value = 'birthDate';
  //   });

  //   await act(async () => {
  //     fireEvent.keyDown(screen.getByTestId('selected'), { key: 'Enter', code: 'Enter' });
  //   });

  //   await act(async () => {
  //     fireEvent.click(screen.getByText('OK'));
  //   });

  //   expect(currSearch.fields).toMatchObject(['name']);
  // });

});
