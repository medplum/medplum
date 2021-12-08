import { Bundle, Operator, StructureDefinition } from '@medplum/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';
import { SearchControl, SearchControlProps } from './SearchControl';

const patientStructure: StructureDefinition = {
  resourceType: 'StructureDefinition',
  id: '123',
  name: 'Patient',
  snapshot: {
    element: [
      {
        id: 'Patient.name',
        path: 'Patient.name',
        type: [{
          code: 'HumanName'
        }]
      }
    ]
  }
};

const patientSearchParams: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: {
      resourceType: 'SearchParameter',
      id: 'Patient-name',
      code: 'name',
      name: 'name',
      expression: 'Patient.name'
    }
  }]
};

const patientStructureBundle: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: patientStructure
  }]
};

const aliceSearchBundle: Bundle = {
  resourceType: 'Bundle',
  total: 100,
  entry: [{
    resource: {
      resourceType: 'Patient',
      id: '123',
      name: [{
        given: ['Alice'],
        family: 'Smith'
      }]
    }
  }]
};

const emptySearchBundle: Bundle = {
  resourceType: 'Bundle',
  total: 0,
  entry: []
};

const medplum = new MockClient({
  'fhir/R4/StructureDefinition?name:exact=Patient': {
    'GET': patientStructureBundle
  },
  'fhir/R4/SearchParameter?_count=100&base=Patient': {
    'GET': patientSearchParams
  },
  'fhir/R4/Patient?name=Alice': {
    'GET': aliceSearchBundle
  },
  'fhir/R4/Patient?name=Bob': {
    'GET': emptySearchBundle
  },
});

describe('SearchControl', () => {

  const setup = (args: SearchControlProps) => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <SearchControl {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice'
        }]
      },
      onLoad: jest.fn()
    };

    setup(props)

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Renders empty results', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Bob'
        }]
      },
      onLoad: jest.fn()
    };

    setup(props)

    await act(async () => {
      await waitFor(() => screen.getByTestId('empty-search'));
    });

    const control = screen.getByTestId('empty-search');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Renders with checkboxes', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice'
        }]
      },
      onLoad: jest.fn(),
      checkboxesEnabled: true
    };

    setup(props)

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Renders empty results with checkboxes', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Bob'
        }]
      },
      onLoad: jest.fn(),
      checkboxesEnabled: true
    };

    setup(props)

    await act(async () => {
      await waitFor(() => screen.getByTestId('empty-search'));
    });

    const control = screen.getByTestId('empty-search');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Renders filters', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        fields: ['id', 'name'],
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice'
        }]
      },
      onLoad: jest.fn()
    };

    setup(props)

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Next page button', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice'
        }]
      },
      onChange: jest.fn()
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('next-page-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-page-button'));
    });

    expect(props.onChange).toBeCalled();
  });

  test('Next page button without onChange listener', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice'
        }]
      }
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('next-page-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-page-button'));
    });

  });

  test('Prev page button', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice'
        }]
      },
      onChange: jest.fn()
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('prev-page-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('prev-page-button'));
    });

    expect(props.onChange).toBeCalled();
  });

  test('New button', async () => {
    const onNew = jest.fn();

    setup({
      search: {
        resourceType: 'Patient'
      },
      onNew
    });

    await act(async () => {
      await waitFor(() => screen.getByText('New...'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('New...'));
    });

    expect(onNew).toBeCalled();
  });

  test('Delete button', async () => {
    const onDelete = jest.fn();

    setup({
      search: {
        resourceType: 'Patient'
      },
      onDelete
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Delete...'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Delete...'));
    });

    expect(onDelete).toBeCalled();
  });

  test('Click on row', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice'
        }]
      },
      onClick: jest.fn()
    };

    setup(props);

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('search-control-row'));
    });

    await act(async () => {
      const rows = screen.getAllByTestId('search-control-row');
      fireEvent.click(rows[0]);
    });

    expect(props.onClick).toBeCalled();
  });

  test('Open field editor', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice'
        }]
      },
      onLoad: jest.fn()
    };

    setup(props)

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('fields-button'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Field editor onOk', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice'
        }]
      },
      onLoad: jest.fn()
    };

    setup(props)

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('fields-button'));
    });

    await act(async () => {
      await waitFor(() => screen.getByTestId('dialog-ok'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('dialog-ok'));
    });

  });

  test('Field editor onCancel', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice'
        }]
      },
      onLoad: jest.fn()
    };

    setup(props)

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('fields-button'));
    });

    await act(async () => {
      await waitFor(() => screen.getByTestId('dialog-cancel'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('dialog-cancel'));
    });

  });

  test('Open filter editor', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice'
        }]
      },
      onLoad: jest.fn()
    };

    setup(props)

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('filters-button'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();
  });

  test('Click all checkbox', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice'
        }]
      },
      onLoad: jest.fn(),
      checkboxesEnabled: true
    };

    setup(props)

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('all-checkbox'));
    });

    const allCheckbox = screen.getByTestId('all-checkbox');
    expect(allCheckbox).toBeDefined();
    expect((allCheckbox as HTMLInputElement).checked).toEqual(true);

    const rowCheckboxes = screen.queryAllByTestId('row-checkbox');
    expect(rowCheckboxes).toBeDefined();
    expect(rowCheckboxes.length).toEqual(1);
    expect((rowCheckboxes[0] as HTMLInputElement).checked).toEqual(true);
  });

  test('Click row checkbox', async () => {
    const props = {
      search: {
        resourceType: 'Patient',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice'
        }]
      },
      onLoad: jest.fn(),
      checkboxesEnabled: true
    };

    setup(props)

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
    expect(props.onLoad).toBeCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('row-checkbox'));
    });

    const allCheckbox = screen.getByTestId('all-checkbox');
    expect(allCheckbox).toBeDefined();
    expect((allCheckbox as HTMLInputElement).checked).toEqual(true);

    const rowCheckboxes = screen.queryAllByTestId('row-checkbox');
    expect(rowCheckboxes).toBeDefined();
    expect(rowCheckboxes.length).toEqual(1);
    expect((rowCheckboxes[0] as HTMLInputElement).checked).toEqual(true);
  });

});
