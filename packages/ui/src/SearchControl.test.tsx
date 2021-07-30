import { Bundle, MedplumClient, Operator, StructureDefinition } from '@medplum/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
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

const patientStructureBundle: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: patientStructure
  }]
};

const patientSearchBundle: Bundle = {
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

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

function mockFetch(url: string, options: any): Promise<any> {
  const method = options.method ?? 'GET';
  let result: any;

  if (method === 'GET' && url.includes('/fhir/R4/StructureDefinition?name=Patient')) {
    result = patientStructureBundle;
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Patient')) {
    result = patientSearchBundle;
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...result
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
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

const setup = (args: SearchControlProps) => {
  return render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <SearchControl {...args} />
    </MedplumProvider>
  );
};

test('SearchControl renders', async (done) => {
  const props = {
    search: {
      resourceType: 'Patient'
    },
    onLoad: jest.fn()
  };

  setup(props)

  await act(async () => {
    await waitFor(() => screen.getByTestId('search-control'));
  });

  const control = screen.getByTestId('search-control');
  expect(control).not.toBeUndefined();
  expect(props.onLoad).toBeCalled();
  done();
});

test('SearchControl renders filters', async (done) => {
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
  expect(control).not.toBeUndefined();
  expect(props.onLoad).toBeCalled();
  done();
});

test('SearchControl next page button', async (done) => {
  const props = {
    search: {
      resourceType: 'Patient'
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
  done();
});

test('SearchControl prev page button', async (done) => {
  const props = {
    search: {
      resourceType: 'Patient'
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
  done();
});

test('SearchControl new button', async (done) => {
  mockRouter.push = jest.fn();

  setup({
    search: {
      resourceType: 'Patient'
    }
  });

  await act(async () => {
    await waitFor(() => screen.getByTestId('new-button'));
  });

  await act(async () => {
    fireEvent.click(screen.getByTestId('new-button'));
  });

  expect(mockRouter.push).toBeCalled();
  done();
});

test('SearchControl click on row', async (done) => {
  const props = {
    search: {
      resourceType: 'Patient'
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
  done();
});

test('SearchControl open field editor', async (done) => {
  const props = {
    search: {
      resourceType: 'Patient'
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
  expect(control).not.toBeUndefined();
  expect(props.onLoad).toBeCalled();
  done();
});

test('SearchControl open filter editor', async (done) => {
  const props = {
    search: {
      resourceType: 'Patient'
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
  expect(control).not.toBeUndefined();
  expect(props.onLoad).toBeCalled();
  done();
});
