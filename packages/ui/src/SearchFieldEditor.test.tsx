import { IndexedStructureDefinition, SearchRequest } from '@medplum/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { SearchFieldEditor } from './SearchFieldEditor';

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

test('SearchFieldEditor add field with Add button', async () => {
  window.prompt = jest.fn().mockImplementation(() => 'xyz');

  let currSearch: SearchRequest = {
    resourceType: 'Patient',
    fields: ['name']
  };

  const utils = render(<SearchFieldEditor
    schema={schema}
    search={currSearch}
    visible={true}
    onOk={e => currSearch = e}
    onCancel={() => console.log('onCancel')}
  />);

  await act(async () => {
    (utils.getByTestId('available') as HTMLSelectElement).value = 'birthDate';
  });

  await act(async () => {
    fireEvent.click(screen.getByText('Add'));
  });

  await act(async () => {
    fireEvent.click(screen.getByText('OK'));
  });

  expect(currSearch.fields).toMatchObject(['name', 'birthDate']);
});

test('SearchFieldEditor add field with Enter key', async () => {
  window.prompt = jest.fn().mockImplementation(() => 'xyz');

  let currSearch: SearchRequest = {
    resourceType: 'Patient',
    fields: ['name']
  };

  const utils = render(<SearchFieldEditor
    schema={schema}
    search={currSearch}
    visible={true}
    onOk={e => currSearch = e}
    onCancel={() => console.log('onCancel')}
  />);

  await act(async () => {
    (utils.getByTestId('available') as HTMLSelectElement).value = 'birthDate';
  });

  await act(async () => {
    fireEvent.keyDown(screen.getByTestId('available'), { key: 'Enter', code: 'Enter' });
  });

  await act(async () => {
    fireEvent.click(screen.getByText('OK'));
  });

  expect(currSearch.fields).toMatchObject(['name', 'birthDate']);
});

test('SearchFieldEditor remove field with Remove button', async () => {
  window.prompt = jest.fn().mockImplementation(() => 'xyz');

  let currSearch: SearchRequest = {
    resourceType: 'Patient',
    fields: ['name', 'birthDate']
  };

  const utils = render(<SearchFieldEditor
    schema={schema}
    search={currSearch}
    visible={true}
    onOk={e => currSearch = e}
    onCancel={() => console.log('onCancel')}
  />);

  await act(async () => {
    (utils.getByTestId('selected') as HTMLSelectElement).value = 'birthDate';
  });

  await act(async () => {
    fireEvent.click(screen.getByText('Remove'));
  });

  await act(async () => {
    fireEvent.click(screen.getByText('OK'));
  });

  expect(currSearch.fields).toMatchObject(['name']);
});

test('SearchFieldEditor remove field with Remove button', async () => {
  window.prompt = jest.fn().mockImplementation(() => 'xyz');

  let currSearch: SearchRequest = {
    resourceType: 'Patient',
    fields: ['name', 'birthDate']
  };

  const utils = render(<SearchFieldEditor
    schema={schema}
    search={currSearch}
    visible={true}
    onOk={e => currSearch = e}
    onCancel={() => console.log('onCancel')}
  />);

  await act(async () => {
    (utils.getByTestId('selected') as HTMLSelectElement).value = 'birthDate';
  });

  await act(async () => {
    fireEvent.keyDown(screen.getByTestId('selected'), { key: 'Enter', code: 'Enter' });
  });

  await act(async () => {
    fireEvent.click(screen.getByText('OK'));
  });

  expect(currSearch.fields).toMatchObject(['name']);
});
