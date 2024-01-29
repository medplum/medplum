import { HomerServiceRequest, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { randomUUID } from 'crypto';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { HeaderSearchInput } from './HeaderSearchInput';

const medplum = new MockClient();
medplum.graphql = jest.fn((query: string) => {
  const data: Record<string, unknown> = {};
  if (query.includes('"Simpson"')) {
    data.Patients1 = [HomerSimpson];
  }
  if (query.includes('"hom sim"')) {
    data.Patients1 = [HomerSimpson];
  }
  if (query.includes('"abc"')) {
    data.Patients2 = [HomerSimpson];
  }
  if (query.includes('"00000000-0000-0000-0000-000000000000"')) {
    data.Patients1 = [HomerSimpson];
  }
  if (query.includes('"9001"')) {
    data.ServiceRequestList = [HomerServiceRequest];
  }
  if (query.includes('"alpha"')) {
    const names = ['___alpha', '__alpha', '_alpha', 'alpha'];
    data.ServiceRequestList = names.map((name) => ({
      resourceType: 'Patient',
      id: randomUUID(),
      name: [
        {
          given: [name],
        },
      ],
    }));
  }
  if (query.includes('"many"')) {
    data.Patients1 = new Array(10).fill(0).map(() => ({
      resourceType: 'Patient',
      id: randomUUID(),
      name: [
        {
          family: '__Many__',
          given: [randomUUID()],
        },
      ],
    }));
  }
  if (query.includes('"empty"')) {
    data.Patients1 = [
      {
        resourceType: 'Patient',
        id: 'emptyPatient',
        identifier: [
          {
            system: '',
            value: '',
          },
        ],
      },
    ];
    data.ServiceRequestList = [
      {
        resourceType: 'ServiceRequest',
        id: 'emptyServiceRequest',
        identifier: [
          {
            system: '',
            value: '',
          },
        ],
      },
    ];
  }
  return Promise.resolve({ data });
});

const navigateMock = jest.fn();

function setup(): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum} navigate={navigateMock}>
        <HeaderSearchInput />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('HeaderSearchInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    navigateMock.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty', () => {
    setup();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  test('Use autocomplete', async () => {
    setup();

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter "Simpson"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Simpson' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(navigateMock).toHaveBeenCalledWith('/Patient/' + HomerSimpson.id);
  });

  test('Search by UUID', async () => {
    setup();

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter "00000000-0000-0000-0000-000000000000"
    await act(async () => {
      fireEvent.change(input, { target: { value: '00000000-0000-0000-0000-000000000000' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(navigateMock).toHaveBeenCalledWith('/Patient/' + HomerSimpson.id);
  });

  test.each(['Simpson', 'hom sim', 'abc', '9001'])('onChange with %s', async (query) => {
    setup();

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter the search term
    // Can be patient name, patient identifier, or service request identifier
    await act(async () => {
      fireEvent.change(input, { target: { value: query } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // expect(onChange).toHaveBeenCalled();
  });

  test('Sort by relevance', async () => {
    setup();

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter "Simpson"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'many' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // There should only be 5 results displayed
    const elements = screen.getAllByText('__Many__', { exact: false });
    expect(elements.length).toBe(5);
  });

  test('Max results', async () => {
    setup();

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter "many"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'many' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // There should only be 5 results displayed
    const elements = screen.getAllByText('__Many__', { exact: false });
    expect(elements.length).toBe(5);
  });

  test('Empty strings', async () => {
    setup();

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter "empty"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'empty' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    expect(screen.getByText('Patient/emptyPatient')).toBeInTheDocument();
    expect(screen.getByText('ServiceRequest/emptyServiceRequest')).toBeInTheDocument();
  });
});
