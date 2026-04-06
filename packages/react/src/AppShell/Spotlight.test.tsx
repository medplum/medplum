// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { spotlight } from '@mantine/spotlight';
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

const mockNavigate = jest.fn();

jest.mock('@medplum/react-hooks', () => {
  const actual = jest.requireActual('@medplum/react-hooks');
  return {
    ...actual,
    useMedplumNavigate: () => mockNavigate,
  };
});

async function openSpotlight(): Promise<void> {
  await act(async () => {
    spotlight.open();
  });
  await waitFor(() => {
    expect(screen.getByPlaceholderText('Start typing to search…')).toBeInTheDocument();
  });
}

describe('Spotlight', () => {
  let medplum: MockClient;

  async function setup(patientsOnly?: boolean): Promise<ReturnType<typeof render>> {
    const result = render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Spotlight patientsOnly={patientsOnly} />
        </MantineProvider>
      </MedplumProvider>
    );
    await openSpotlight();
    return result;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();
    medplum = new MockClient();
    spotlight.close();
  });

  afterEach(() => {
    spotlight.close();
  });

  describe('Initial render', () => {
    test('shows keyboard shortcut hint on initial render', async () => {
      await setup();

      expect(screen.getByText(/Press/)).toBeInTheDocument();
      expect(screen.getByText(/to open Search next time/)).toBeInTheDocument();
    });

    test('renders spotlight component', async () => {
      await setup();

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Start typing to search…')).toBeInTheDocument();
    });

    test('shows correct placeholder text', async () => {
      await setup();

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      expect(searchInput).toHaveAttribute('placeholder', 'Start typing to search…');
    });
  });

  describe('Search functionality', () => {
    test('shows "Searching..." when query is entered', async () => {
      await setup();

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Jane' } });
      });

      expect(screen.getByText('Searching...')).toBeInTheDocument();
    });

    test('performs search and shows results', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql').mockResolvedValue({
        data: {
          Patients1: [
            {
              resourceType: 'Patient',
              id: 'jane-123',
              name: [{ given: ['Jane'], family: 'Smith' }],
              birthDate: '1985-05-15',
            },
          ],
          Patients2: undefined,
          ServiceRequestList: undefined,
        },
      });

      const valueSetSpy = jest.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: {
          timestamp: new Date().toISOString(),
          contains: [],
        },
      });

      await setup();

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Jane' } });
      });

      await waitFor(
        () => {
          expect(document.querySelector('[data-action][group="Patients"]')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      graphqlSpy.mockRestore();
      valueSetSpy.mockRestore();
    });

    test('searches by UUID when input is a valid UUID', async () => {
      const patient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['UUID'], family: 'Patient' }],
      });

      await setup();

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: patient.id } });
      });

      // After entering a UUID, the component should show searching feedback
      await waitFor(() => {
        const emptyArea = document.querySelector('.mantine-Spotlight-empty');
        expect(emptyArea).toBeInTheDocument();
      });
    });

    test('returns to keyboard hint when query is cleared', async () => {
      await setup();

      const searchInput = screen.getByPlaceholderText('Start typing to search…');

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'test' } });
      });

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

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'nonexistentzzzxxx' } });
      });

      await waitFor(
        () => {
          expect(screen.getByText('No results found')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('patientsOnly mode', () => {
    test('searches only patients when patientsOnly is true', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql').mockResolvedValue({
        data: {
          Patients1: [
            {
              resourceType: 'Patient',
              id: 'test-patient-1',
              name: [{ given: ['Test'], family: 'Patient' }],
            },
          ],
          Patients2: undefined,
          ServiceRequestList: [
            {
              resourceType: 'ServiceRequest',
              id: 'sr-should-not-appear',
              subject: { display: 'Ignored SR' },
            },
          ],
        },
      });

      await setup(true);

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Test' } });
      });

      await waitFor(
        () => {
          // In patientsOnly mode, only patient actions should appear (no resource types, no SRs)
          expect(document.querySelector('[data-action][group="Patients"]')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Should not have service request or resource type groups
      expect(document.querySelector('[data-action][group="Service Requests"]')).not.toBeInTheDocument();
      expect(document.querySelector('[data-action][group="Resource Types"]')).not.toBeInTheDocument();

      graphqlSpy.mockRestore();
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

      const valueSetSpy = jest.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: { timestamp: new Date().toISOString(), contains: [] },
      });

      await setup();

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Test' } });
      });

      await waitFor(
        () => {
          expect(document.querySelector('[data-action][group="Patients"]')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      const patientAction = document.querySelector('[data-action][group="Patients"]') as HTMLElement;
      await act(async () => {
        fireEvent.click(patientAction);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/Patient/patient-123');

      graphqlSpy.mockRestore();
      valueSetSpy.mockRestore();
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

      const valueSetSpy = jest.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: { timestamp: new Date().toISOString(), contains: [] },
      });

      await setup();

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Test' } });
      });

      await waitFor(
        () => {
          expect(document.querySelector('[data-action][group="Service Requests"]')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      const srAction = document.querySelector('[data-action][group="Service Requests"]') as HTMLElement;
      await act(async () => {
        fireEvent.click(srAction);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/ServiceRequest/sr-123');

      graphqlSpy.mockRestore();
      valueSetSpy.mockRestore();
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

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Obs' } });
      });

      await waitFor(
        () => {
          expect(document.querySelector('[data-action][group="Resource Types"]')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      const rtAction = document.querySelector('[data-action][group="Resource Types"]') as HTMLElement;
      await act(async () => {
        fireEvent.click(rtAction);
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

      const valueSetSpy = jest.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: { timestamp: new Date().toISOString(), contains: [] },
      });

      await setup();

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Alice' } });
      });

      await waitFor(
        () => {
          // Mantine Highlight splits text into <mark> + <span>, so getByText can't match.
          // Query the action label element directly.
          const label = document.querySelector('.mantine-Spotlight-actionLabel');
          expect(label?.textContent).toBe('Alice Wonderland');
        },
        { timeout: 3000 }
      );

      graphqlSpy.mockRestore();
      valueSetSpy.mockRestore();
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

      const valueSetSpy = jest.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: { timestamp: new Date().toISOString(), contains: [] },
      });

      await setup();

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'patient' } });
      });

      await waitFor(
        () => {
          const label = document.querySelector('.mantine-Spotlight-actionLabel');
          expect(label?.textContent).toBe('patient-no-name');
        },
        { timeout: 3000 }
      );

      graphqlSpy.mockRestore();
      valueSetSpy.mockRestore();
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

      const valueSetSpy = jest.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: { timestamp: new Date().toISOString(), contains: [] },
      });

      await setup();

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'DOB' } });
      });

      await waitFor(
        () => {
          expect(screen.getByText('1985-12-25')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      graphqlSpy.mockRestore();
      valueSetSpy.mockRestore();
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

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Enc' } });
      });

      await waitFor(
        () => {
          expect(screen.getByText('Resource Type')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

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

      const valueSetSpy = jest.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: { timestamp: new Date().toISOString(), contains: [] },
      });

      await setup();

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'sr' } });
      });

      await waitFor(
        () => {
          expect(screen.getByText('John Doe')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      graphqlSpy.mockRestore();
      valueSetSpy.mockRestore();
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

      const valueSetSpy = jest.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: { timestamp: new Date().toISOString(), contains: [] },
      });

      await setup();

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Duplicate' } });
      });

      await waitFor(
        () => {
          expect(document.querySelector('[data-action][group="Patients"]')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Should only have one action for the patient
      const patientActions = document.querySelectorAll('[data-action][group="Patients"]');
      expect(patientActions).toHaveLength(1);

      graphqlSpy.mockRestore();
      valueSetSpy.mockRestore();
    });
  });
});
