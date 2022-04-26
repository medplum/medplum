import { IndexedStructureDefinition, SearchRequest } from '@medplum/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { SearchFieldEditor } from './SearchFieldEditor';

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
    },
  },
};

describe('SearchFieldEditor', () => {
  test('Render not visible', () => {
    const currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['name'],
    };

    render(<SearchFieldEditor schema={schema} search={currSearch} visible={false} onOk={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByText('OK')).toBeNull();
  });

  test('Add field with Add button', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['name'],
    };

    render(
      <SearchFieldEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      (screen.getByTestId('available') as HTMLSelectElement).value = 'birthDate';
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.fields).toMatchObject(['name', 'birthDate']);
  });

  test('Add field with Enter key', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['name'],
    };

    render(
      <SearchFieldEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      (screen.getByTestId('available') as HTMLSelectElement).value = 'birthDate';
    });

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('available'), {
        key: 'Enter',
        code: 'Enter',
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.fields).toMatchObject(['name', 'birthDate']);
  });

  test('Add field with double click', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['name'],
    };

    render(
      <SearchFieldEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      (screen.getByTestId('available') as HTMLSelectElement).value = 'birthDate';
    });

    await act(async () => {
      fireEvent.doubleClick(screen.getByTestId('available'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.fields).toMatchObject(['name', 'birthDate']);
  });

  test('Remove field with Remove button', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['name', 'birthDate'],
    };

    render(
      <SearchFieldEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      (screen.getByTestId('selected') as HTMLSelectElement).value = 'birthDate';
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Remove'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.fields).toMatchObject(['name']);
  });

  test('Remove field with double click', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['name', 'birthDate'],
    };

    render(
      <SearchFieldEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      (screen.getByTestId('selected') as HTMLSelectElement).value = 'birthDate';
    });

    await act(async () => {
      fireEvent.doubleClick(screen.getByTestId('selected'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.fields).toMatchObject(['name']);
  });

  test('Remove field with Remove button', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['name', 'birthDate'],
    };

    render(
      <SearchFieldEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      (screen.getByTestId('selected') as HTMLSelectElement).value = 'birthDate';
    });

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('selected'), {
        key: 'Enter',
        code: 'Enter',
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.fields).toMatchObject(['name']);
  });

  test('Move field up with Up button', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['name', 'birthDate'],
    };

    render(
      <SearchFieldEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      (screen.getByTestId('selected') as HTMLSelectElement).value = 'birthDate';
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Up'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.fields).toMatchObject(['birthDate', 'name']);
  });

  test('Move field down with Down button', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['name', 'birthDate'],
    };

    render(
      <SearchFieldEditor
        schema={schema}
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      (screen.getByTestId('selected') as HTMLSelectElement).value = 'name';
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Down'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.fields).toMatchObject(['birthDate', 'name']);
  });
});
