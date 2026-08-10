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
import type { SpotlightProps } from './Spotlight';
import { Spotlight } from './Spotlight';

// Index the structure definitions and search parameters for MockClient
const structureDefinitions = readJson('fhir/r4/profiles-resources.json') as Bundle;
indexStructureDefinitionBundle(structureDefinitions);
for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
  indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
}

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock(import('@medplum/react-hooks'), async (importOriginal) => {
  const actual = await importOriginal();
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

  async function setup(patientsOnly?: boolean, props?: Partial<SpotlightProps>): Promise<ReturnType<typeof render>> {
    const result = render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Spotlight patientsOnly={patientsOnly} {...props} />
        </MantineProvider>
      </MedplumProvider>
    );
    await openSpotlight();
    return result;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    medplum = new MockClient();

    act(() => {
      spotlight.close();
    });
  });

  afterEach(() => {
    act(() => {
      spotlight.close();
    });
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

    test('shows keyboard shortcut hints in the footer', async () => {
      await setup();

      expect(screen.getByText('Open search')).toBeInTheDocument();
      expect(screen.getByText('Select')).toBeInTheDocument();
      expect(screen.getByText('Open / Go')).toBeInTheDocument();
    });
  });

  describe('staticActions', () => {
    const staticActions = [
      { id: 'action-new-task', href: '/Task/new', label: 'New Task', onClick: vi.fn() },
      { id: 'action-send-fax', href: '/Fax/Communication/new', label: 'Send a Fax', onClick: vi.fn() },
    ];

    test('lists static actions in the empty state', async () => {
      await setup(true, { staticActions });

      // Mantine renders the group label through a `--spotlight-label` var on a ::before pseudo-element
      expect(document.querySelector('.actionsGroup')?.getAttribute('style')).toContain("--spotlight-label: 'Actions'");
      expect(screen.getByText('New Task')).toBeInTheDocument();
      expect(screen.getByText('Send a Fax')).toBeInTheDocument();
      // Static actions replace the keyboard hint as the empty state
      expect(screen.queryByText(/to open Search next time/)).not.toBeInTheDocument();
    });

    test('clicking a static action invokes its onClick', async () => {
      await setup(true, { staticActions });

      await act(async () => {
        fireEvent.click(screen.getByText('New Task'));
      });

      expect(staticActions[0].onClick).toHaveBeenCalled();
    });

    test('hides static actions once a query is entered', async () => {
      await setup(true, { staticActions });

      const searchInput = screen.getByPlaceholderText('Start typing to search…');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Jane' } });
      });

      expect(screen.queryByText('New Task')).not.toBeInTheDocument();
      expect(screen.getByText('Searching...')).toBeInTheDocument();
    });

    test('navigates to href when an action has no onClick', async () => {
      await setup(true, { staticActions: [{ id: 'action-new-task', href: '/Task/new', label: 'New Task' }] });

      await act(async () => {
        fireEvent.click(screen.getByText('New Task'));
      });

      expect(mockNavigate).toHaveBeenCalledWith('/Task/new');
    });

    test('renders actions with an href as anchors', async () => {
      await setup(true, { staticActions });

      const action = document.querySelector('[data-action][group="Actions"]') as HTMLAnchorElement;
      expect(action.tagName).toBe('A');
      expect(action).toHaveAttribute('href', '/Task/new');
    });

    test('leaves modified clicks to the browser so the link opens in a new tab', async () => {
      await setup(true, { staticActions });

      // Runs after the component's handler; also stops jsdom from acting on the anchor
      const defaultPrevented: boolean[] = [];
      document.addEventListener(
        'click',
        (event) => {
          defaultPrevented.push(event.defaultPrevented);
          event.preventDefault();
        },
        { once: true }
      );

      const action = document.querySelector('[data-action][group="Actions"]') as HTMLElement;
      await act(async () => {
        fireEvent.click(action, { metaKey: true });
      });

      // The browser opens the new tab; the SPA must neither swallow the click nor navigate the current tab
      expect(defaultPrevented).toEqual([false]);
      expect(staticActions[0].onClick).not.toHaveBeenCalled();
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
      const graphqlSpy = vi.spyOn(medplum, 'graphql').mockResolvedValue({
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

      const valueSetSpy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
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
      const graphqlSpy = vi.spyOn(medplum, 'graphql').mockResolvedValue({
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
      const graphqlSpy = vi.spyOn(medplum, 'graphql').mockResolvedValue({
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

      const valueSetSpy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
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
      // Results are anchors, so they support right-click "Open in new tab"
      expect(patientAction).toHaveAttribute('href', '/Patient/patient-123');

      await act(async () => {
        fireEvent.click(patientAction);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/Patient/patient-123');

      graphqlSpy.mockRestore();
      valueSetSpy.mockRestore();
    });

    test('clicking search result service request navigates to service request page', async () => {
      const graphqlSpy = vi.spyOn(medplum, 'graphql').mockResolvedValue({
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

      const valueSetSpy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
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
      const graphqlSpy = vi.spyOn(medplum, 'graphql').mockResolvedValue({
        data: {
          Patients1: undefined,
          Patients2: undefined,
          ServiceRequestList: undefined,
        },
      });

      const valueSetSpy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
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
      const graphqlSpy = vi.spyOn(medplum, 'graphql').mockResolvedValue({
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

      const valueSetSpy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
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
      const graphqlSpy = vi.spyOn(medplum, 'graphql').mockResolvedValue({
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

      const valueSetSpy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
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
      const graphqlSpy = vi.spyOn(medplum, 'graphql').mockResolvedValue({
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

      const valueSetSpy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
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
      const graphqlSpy = vi.spyOn(medplum, 'graphql').mockResolvedValue({
        data: {
          Patients1: undefined,
          Patients2: undefined,
          ServiceRequestList: undefined,
        },
      });

      const valueSetSpy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
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
      const graphqlSpy = vi.spyOn(medplum, 'graphql').mockResolvedValue({
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

      const valueSetSpy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
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
      const graphqlSpy = vi.spyOn(medplum, 'graphql').mockResolvedValue({
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

      const valueSetSpy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
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
