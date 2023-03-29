import { SearchRequest } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { SearchFieldEditor } from './SearchFieldEditor';

describe('SearchFieldEditor', () => {
  beforeAll(async () => {
    await new MockClient().requestSchema('Patient');
  });

  test('Render not visible', () => {
    const currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['name'],
    };

    render(<SearchFieldEditor search={currSearch} visible={false} onOk={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.queryByText('OK')).toBeNull();
  });

  test('Add field with Add button', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['name'],
    };

    render(
      <SearchFieldEditor
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
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      (screen.getByTestId('selected') as HTMLSelectElement).value = 'birthDate';
    });

    // Click "Up" once to move the field up
    await act(async () => {
      fireEvent.click(screen.getByText('Up'));
    });

    // Click "Up" again, this should be a no-op
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
        search={currSearch}
        visible={true}
        onOk={(e) => (currSearch = e)}
        onCancel={() => console.log('onCancel')}
      />
    );

    await act(async () => {
      (screen.getByTestId('selected') as HTMLSelectElement).value = 'name';
    });

    // Click "Down" once to move the field down
    await act(async () => {
      fireEvent.click(screen.getByText('Down'));
    });

    // Click "Down" again even though at the bottom, this should be a no-op
    await act(async () => {
      fireEvent.click(screen.getByText('Down'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(currSearch.fields).toMatchObject(['birthDate', 'name']);
  });
});
