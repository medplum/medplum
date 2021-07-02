import { render, screen } from '@testing-library/react';
import React from 'react';
import { IndexedStructureDefinition } from '../../core/dist';
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
