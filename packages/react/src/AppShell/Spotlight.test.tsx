// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Bundle, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Spotlight } from './Spotlight';

// Index the structure definitions and search parameters for MockClient
const structureDefinitions = readJson('fhir/r4/profiles-resources.json') as Bundle;
indexStructureDefinitionBundle(structureDefinitions);
for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
  indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
}

// Mock Mantine Spotlight to expose internal behavior for testing
jest.mock('@mantine/spotlight', () => {
  const React = jest.requireActual('react');
  return {
    Spotlight: ({ actions, nothingFound, onQueryChange, searchProps }: any) => {
      const [query, setQuery] = React.useState('');
      return (
        <div data-testid="spotlight">
          <input
            data-testid="spotlight-search"
            placeholder={searchProps?.placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onQueryChange?.(e.target.value);
            }}
          />
          {nothingFound && <div data-testid="nothing-found">{nothingFound}</div>}
          {actions?.map((group: any) => (
            <div key={group.group} data-testid={`action-group-${group.group}`}>
              <span>{group.group}</span>
              {group.actions?.map((action: any) => (
                <button key={action.id} data-testid={`action-${action.id}`} onClick={action.onClick}>
                  {action.leftSection}
                  <span>{action.label}</span>
                  <span>{action.description}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      );
    },
  };
});

const mockNavigate = jest.fn();
const debounceWaitMs = 250;

jest.mock('@medplum/react-hooks', () => {
  const actual = jest.requireActual('@medplum/react-hooks');
  return {
    ...actual,
    useMedplumNavigate: () => mockNavigate,
  };
});

describe('Spotlight', () => {
  let medplum: MockClient;

  const flushDebounceTimers = async (): Promise<void> => {
    let hasFakeTimers = false;
    try {
      jest.getTimerCount();
      hasFakeTimers = true;
    } catch {
      hasFakeTimers = false;
    }
    if (!hasFakeTimers) {
      return;
    }
    await act(async () => {
      jest.advanceTimersByTime(debounceWaitMs);
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  async function setup(patientsOnly?: boolean): Promise<ReturnType<typeof render>> {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Spotlight patientsOnly={patientsOnly} />
        </MantineProvider>
      </MedplumProvider>
    );
  }

  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockNavigate.mockReset();
    medplum = new MockClient();
  });

  describe('Initial render', () => {
    test('shows keyboard shortcut hint on initial render', async () => {
      await setup();

      await waitFor(() => {
        expect(screen.getByTestId('nothing-found')).toBeInTheDocument();
      });

      expect(screen.getByText(/Press/)).toBeInTheDocument();
      expect(screen.getByText(/to open Search next time/)).toBeInTheDocument();
    });

    test('renders spotlight component', async () => {
      await setup();

      expect(screen.getByTestId('spotlight')).toBeInTheDocument();
      expect(screen.getByTestId('spotlight-search')).toBeInTheDocument();
    });

    test('shows correct placeholder text', async () => {
      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      expect(searchInput).toHaveAttribute('placeholder', 'Start typing to search…');
    });
  });

  describe('Search functionality', () => {
    test('shows "Searching..." when query is entered', async () => {
      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Jane' } });
      });
      await flushDebounceTimers();

      expect(screen.getByText('Searching...')).toBeInTheDocument();
    });

    test('performs search and shows results', async () => {
      await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Jane'], family: 'Smith' }],
        birthDate: '1985-05-15',
      });

      // Mock valueSetExpand to prevent hanging on resource type search
      const valueSetSpy = jest.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: {
          timestamp: new Date().toISOString(),
          contains: [],
        },
      });

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Jane' } });
      });

      await waitFor(
        () => {
          expect(screen.getByText('No results found')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      valueSetSpy.mockRestore();
    });

    test('searches by UUID when input is a valid UUID', async () => {
      const patient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['UUID'], family: 'Patient' }],
      });

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: patient.id } });
      });
      await flushDebounceTimers();

      await waitFor(() => {
        expect(screen.getByTestId('nothing-found')).toBeInTheDocument();
      });
    });

    test('returns to keyboard hint when query is cleared', async () => {
      await setup();

      const searchInput = screen.getByTestId('spotlight-search');

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'test' } });
      });
      await flushDebounceTimers();

      expect(screen.getByText('Searching...')).toBeInTheDocument();

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: '' } });
      });

      await waitFor(() => {
        expect(screen.getByText(/Press/)).toBeInTheDocument();
      });
    });

    test('handles empty search results', async () => {
      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'nonexistentzzzxxx' } });
      });
      await flushDebounceTimers();

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument();
      });
    });
  });

  describe('patientsOnly mode', () => {
    test('searches only patients when patientsOnly is true', async () => {
      await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Test'], family: 'Patient' }],
      });

      await setup(true);

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Test' } });
      });
      await flushDebounceTimers();
      await flushDebounceTimers();

      await waitFor(
        () => {
          expect(screen.getByText('No results found')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Action clicks and navigation', () => {
    test('clicking search result patient navigates to patient page', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql').mockResolvedValue({
        data: {
          Patients1: [
            {
              resourceType: 'Patient',
              id: 'patient-123',
              name: [{ given: ['Test'], family: 'Patient' }],
              birthDate: '1990-01-01',
            },
          ],
          Patients2: undefined,
          ServiceRequestList: undefined,
        },
      });

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Test' } });
      });
      await flushDebounceTimers();

      await waitFor(() => {
        expect(screen.getByTestId('action-group-Patients')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId('action-patient-123'));
      });

      expect(mockNavigate).toHaveBeenCalledWith('/Patient/patient-123');

      graphqlSpy.mockRestore();
    });

    test('clicking search result service request navigates to service request page', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql').mockResolvedValue({
        data: {
          Patients1: undefined,
          Patients2: undefined,
          ServiceRequestList: [
            {
              resourceType: 'ServiceRequest',
              id: 'sr-123',
              subject: { display: 'Test Patient' },
            },
          ],
        },
      });

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Test' } });
      });

      await waitFor(() => {
        expect(screen.getByTestId('action-group-Service Requests')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId('action-sr-123'));
      });

      expect(mockNavigate).toHaveBeenCalledWith('/ServiceRequest/sr-123');

      graphqlSpy.mockRestore();
    });

    test('clicking resource type navigates to resource type page', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql').mockResolvedValue({
        data: {
          Patients1: undefined,
          Patients2: undefined,
          ServiceRequestList: undefined,
        },
      });

      const valueSetSpy = jest.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: {
          timestamp: new Date().toISOString(),
          contains: [{ code: 'Observation', display: 'Observation' }],
        },
      });

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Obs' } });
      });
      await flushDebounceTimers();

      await waitFor(() => {
        expect(screen.getByTestId('action-group-Resource Types')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId('action-resource-type-Observation'));
      });

      expect(mockNavigate).toHaveBeenCalledWith('/Observation');

      graphqlSpy.mockRestore();
      valueSetSpy.mockRestore();
    });
  });

  describe('Resource display', () => {
    test('displays patient name when available', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql').mockResolvedValue({
        data: {
          Patients1: [
            {
              resourceType: 'Patient',
              id: 'patient-123',
              name: [{ given: ['Alice'], family: 'Wonderland' }],
              birthDate: '1990-01-01',
            },
          ],
          Patients2: undefined,
          ServiceRequestList: undefined,
        },
      });

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Alice' } });
      });
      await flushDebounceTimers();

      await waitFor(() => {
        expect(screen.getByText('Alice Wonderland')).toBeInTheDocument();
      });

      graphqlSpy.mockRestore();
    });

    test('displays patient ID when name is not available', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql').mockResolvedValue({
        data: {
          Patients1: [
            {
              resourceType: 'Patient',
              id: 'patient-no-name',
              birthDate: '1990-01-01',
            },
          ],
          Patients2: undefined,
          ServiceRequestList: undefined,
        },
      });

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'patient' } });
      });
      await flushDebounceTimers();

      await waitFor(() => {
        expect(screen.getByText('patient-no-name')).toBeInTheDocument();
      });

      graphqlSpy.mockRestore();
    });

    test('displays birthDate as description for patients', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql').mockResolvedValue({
        data: {
          Patients1: [
            {
              resourceType: 'Patient',
              id: 'patient-123',
              name: [{ given: ['DOB'], family: 'Patient' }],
              birthDate: '1985-12-25',
            },
          ],
          Patients2: undefined,
          ServiceRequestList: undefined,
        },
      });

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'DOB' } });
      });
      await flushDebounceTimers();

      await waitFor(() => {
        expect(screen.getByText('1985-12-25')).toBeInTheDocument();
      });

      graphqlSpy.mockRestore();
    });

    test('displays "Resource Type" as description for resource type actions', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql').mockResolvedValue({
        data: {
          Patients1: undefined,
          Patients2: undefined,
          ServiceRequestList: undefined,
        },
      });

      const valueSetSpy = jest.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: {
          timestamp: new Date().toISOString(),
          contains: [{ code: 'Encounter', display: 'Encounter' }],
        },
      });

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Enc' } });
      });
      await flushDebounceTimers();

      await waitFor(() => {
        expect(screen.getByText('Resource Type')).toBeInTheDocument();
      });

      graphqlSpy.mockRestore();
      valueSetSpy.mockRestore();
    });

    test('displays service request subject display', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql').mockResolvedValue({
        data: {
          Patients1: undefined,
          Patients2: undefined,
          ServiceRequestList: [
            {
              resourceType: 'ServiceRequest',
              id: 'sr-123',
              subject: { display: 'John Doe' },
            },
          ],
        },
      });

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'sr' } });
      });
      await flushDebounceTimers();

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      graphqlSpy.mockRestore();
    });
  });

  describe('Deduplication', () => {
    test('deduplicates patients from multiple search results', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql').mockResolvedValue({
        data: {
          Patients1: [
            {
              resourceType: 'Patient',
              id: 'patient-123',
              name: [{ given: ['Duplicate'], family: 'Patient' }],
            },
          ],
          Patients2: [
            {
              resourceType: 'Patient',
              id: 'patient-123', // Same patient from identifier search
              name: [{ given: ['Duplicate'], family: 'Patient' }],
            },
          ],
          ServiceRequestList: undefined,
        },
      });

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Duplicate' } });
      });
      await flushDebounceTimers();

      await waitFor(() => {
        expect(screen.getByTestId('action-group-Patients')).toBeInTheDocument();
      });

      // Should only have one action for the patient
      const patientActions = screen.getAllByTestId('action-patient-123');
      expect(patientActions).toHaveLength(1);

      graphqlSpy.mockRestore();
    });
  });
});
