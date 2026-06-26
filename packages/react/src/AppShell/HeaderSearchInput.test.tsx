// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerServiceRequest, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { randomUUID } from 'crypto';
import { MemoryRouter } from 'react-router';
import { act, clickAutocompleteOption, fireEvent, render, screen, typeInAutocomplete } from '../test-utils/render';
import { HeaderSearchInput } from './HeaderSearchInput';

const medplum = new MockClient();
medplum.graphql = vi.fn((query: string) => {
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

const navigateMock = vi.fn();

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
    vi.useFakeTimers();
    navigateMock.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  test('Renders empty', () => {
    setup();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  test('Use autocomplete', async () => {
    setup();

    const input = screen.getByRole('searchbox');

    await typeInAutocomplete(input, 'Simpson');
    await clickAutocompleteOption('Homer Simpson');

    expect(navigateMock).toHaveBeenCalledWith('/Patient/' + HomerSimpson.id);
  });

  test('Search by UUID', async () => {
    setup();

    const input = screen.getByRole('searchbox');

    await typeInAutocomplete(input, '00000000-0000-0000-0000-000000000000');
    await clickAutocompleteOption('Homer Simpson');

    expect(navigateMock).toHaveBeenCalledWith('/Patient/' + HomerSimpson.id);
  });

  test.each(['Simpson', 'hom sim', 'abc', '9001'])('onChange with %s', async (query) => {
    setup();

    const input = screen.getByRole('searchbox');

    // Can be patient name, patient identifier, or service request identifier
    await typeInAutocomplete(input, query);
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });
  });

  test('Sort by relevance', async () => {
    setup();

    const input = screen.getByRole('searchbox');

    await typeInAutocomplete(input, 'many');

    // There should only be 5 results displayed
    const elements = await screen.findAllByText('__Many__', { exact: false });
    expect(elements.length).toBe(5);
  });

  test('Max results', async () => {
    setup();

    const input = screen.getByRole('searchbox');

    await typeInAutocomplete(input, 'many');

    // There should only be 5 results displayed
    const elements = await screen.findAllByText('__Many__', { exact: false });
    expect(elements.length).toBe(5);
  });

  test('Empty strings', async () => {
    setup();

    const input = screen.getByRole('searchbox');

    await typeInAutocomplete(input, 'empty');

    expect(await screen.findByText('Patient/emptyPatient')).toBeInTheDocument();
    expect(screen.getByText('ServiceRequest/emptyServiceRequest')).toBeInTheDocument();
  });
});
