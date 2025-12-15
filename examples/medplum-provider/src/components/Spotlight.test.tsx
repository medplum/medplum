// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Bundle, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { Spotlight } from './Spotlight';

// Index the structure definitions and search parameters for MockClient
const structureDefinitions = readJson('fhir/r4/profiles-resources.json') as Bundle;
indexStructureDefinitionBundle(structureDefinitions);
for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
  indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
}

// Mock localStorage
const RECENTLY_VIEWED_STORAGE_KEY = 'medplum-provider-spotlight-recently-viewed';
let mockLocalStorageData: Record<string, string> = {};

const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockLocalStorageData[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockLocalStorageData[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockLocalStorageData[key];
  }),
  clear: vi.fn(() => {
    mockLocalStorageData = {};
  }),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// Mock Mantine Spotlight to expose internal behavior for testing
vi.mock('@mantine/spotlight', () => {
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
            <div key={group.group} data-testid={`action-group-${group.group.replace(/\s+/g, '-')}`}>
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

const mockNavigate = vi.fn();

vi.mock('@medplum/react-hooks', async () => {
  const actual = await vi.importActual('@medplum/react-hooks');
  return {
    ...actual,
    useMedplumNavigate: () => mockNavigate,
  };
});

// Mock ResourceAvatar
vi.mock('@medplum/react', () => ({
  ResourceAvatar: ({ value }: any) => <div data-testid={`avatar-${value?.id}`}>Avatar</div>,
}));

describe('Provider Spotlight', () => {
  let medplum: MockClient;

  async function setup(): Promise<ReturnType<typeof render>> {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Spotlight />
        </MantineProvider>
      </MedplumProvider>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorageData = {};
    mockNavigate.mockReset();
    medplum = new MockClient();
  });

  describe('Initial render with no recently viewed items', () => {
    test('shows keyboard shortcut hint when no recently viewed items exist', async () => {
      await setup();

      await waitFor(() => {
        expect(screen.getByTestId('nothing-found')).toBeInTheDocument();
      });

      expect(screen.getByText(/Try/)).toBeInTheDocument();
    });

    test('renders spotlight component', async () => {
      await setup();

      expect(screen.getByTestId('spotlight')).toBeInTheDocument();
      expect(screen.getByTestId('spotlight-search')).toBeInTheDocument();
    });
  });

  describe('Recently viewed patients', () => {
    test('loads and displays recently viewed patients', async () => {
      const patient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['John'], family: 'Doe' }],
        birthDate: '1990-01-01',
      });

      const recentItems = [{ resourceType: 'Patient', id: patient.id, timestamp: Date.now() }];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByTestId('action-group-Recent-Patients')).toBeInTheDocument();
      });

      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    test('filters out items older than 30 days', async () => {
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      const recentItems = [{ resourceType: 'Patient', id: 'old-patient', timestamp: thirtyOneDaysAgo }];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByTestId('nothing-found')).toBeInTheDocument();
      });

      // Should show keyboard shortcut hint
      expect(screen.getByText(/Try/)).toBeInTheDocument();
    });

    test('handles deleted patients gracefully', async () => {
      // Add a patient that doesn't exist in MockClient
      const recentItems = [{ resourceType: 'Patient', id: 'deleted-patient-123', timestamp: Date.now() }];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      // Should show keyboard shortcut hint since the only patient is gone
      await waitFor(() => {
        expect(screen.getByText(/Try/)).toBeInTheDocument();
      });
    });

    test('handles localStorage errors gracefully', async () => {
      mockLocalStorage.getItem.mockImplementationOnce(() => {
        throw new Error('localStorage error');
      });

      await setup();

      expect(screen.getByTestId('spotlight')).toBeInTheDocument();
    });

    test('handles invalid JSON in localStorage', async () => {
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = 'invalid json {{{';

      await setup();

      expect(screen.getByTestId('spotlight')).toBeInTheDocument();
    });

    test('sorts recently viewed by timestamp (most recent first)', async () => {
      const patient1 = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Old'], family: 'Patient' }],
      });

      const patient2 = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['New'], family: 'Patient' }],
      });

      const now = Date.now();
      const recentItems = [
        { resourceType: 'Patient', id: patient1.id, timestamp: now - 10000 },
        { resourceType: 'Patient', id: patient2.id, timestamp: now },
      ];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByTestId('action-group-Recent-Patients')).toBeInTheDocument();
      });

      // Both patients should be visible
      expect(screen.getByText('Old Patient')).toBeInTheDocument();
      expect(screen.getByText('New Patient')).toBeInTheDocument();
    });

    test('shows keyboard shortcut hint when all recently viewed items fail to load', async () => {
      // All patients don't exist
      const recentItems = [
        { resourceType: 'Patient', id: 'nonexistent-1', timestamp: Date.now() },
        { resourceType: 'Patient', id: 'nonexistent-2', timestamp: Date.now() - 1000 },
      ];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByText(/Try/)).toBeInTheDocument();
      });
    });
  });

  describe('Search functionality', () => {
    test('performs search when query is entered', async () => {
      await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Jane'], family: 'Smith' }],
        birthDate: '1985-05-15',
      });

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Jane' } });
      });

      await waitFor(
        () => {
          expect(screen.getByTestId('nothing-found')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
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

      await waitFor(() => {
        expect(screen.getByTestId('nothing-found')).toBeInTheDocument();
      });
    });

    test('returns to recently viewed when query is cleared', async () => {
      const patient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Recent'], family: 'Patient' }],
      });

      const recentItems = [{ resourceType: 'Patient', id: patient.id, timestamp: Date.now() }];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');

      // First, perform a search
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'test' } });
      });

      // Wait for search to complete
      await waitFor(() => {
        expect(screen.getByTestId('nothing-found')).toBeInTheDocument();
      });

      // Then clear the query
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: '' } });
      });

      // Should show recently viewed again
      await waitFor(() => {
        expect(screen.getByText('Recent Patient')).toBeInTheDocument();
      });
    });

    test('handles empty search results', async () => {
      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'nonexistentzzzxxx' } });
      });

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument();
      });
    });
  });

  describe('Action clicks and navigation', () => {
    test('clicking recently viewed patient navigates and tracks', async () => {
      const patient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Click'], family: 'Patient' }],
        birthDate: '1990-01-01',
      });

      const recentItems = [{ resourceType: 'Patient', id: patient.id, timestamp: Date.now() - 10000 }];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByTestId(`action-patient-${patient.id}`)).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId(`action-patient-${patient.id}`));
      });

      expect(mockNavigate).toHaveBeenCalledWith(`/Patient/${patient.id}`);

      // Should have updated timestamp in localStorage
      const stored = JSON.parse(mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY]);
      expect(stored[0].timestamp).toBeGreaterThan(Date.now() - 5000);
    });
  });

  describe('trackRecentlyViewed localStorage management', () => {
    test('removes duplicate entries when tracking same patient again', async () => {
      const patient1 = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['First'], family: 'Patient' }],
      });

      const patient2 = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Second'], family: 'Patient' }],
      });

      const existingItems = [
        { resourceType: 'Patient', id: patient1.id, timestamp: Date.now() - 10000 },
        { resourceType: 'Patient', id: patient2.id, timestamp: Date.now() - 20000 },
      ];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(existingItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByTestId(`action-patient-${patient1.id}`)).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId(`action-patient-${patient1.id}`));
      });

      const stored = JSON.parse(mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY]);
      expect(stored.length).toBe(2);
      expect(stored[0].id).toBe(patient1.id);
    });

    test('limits recently viewed to MAX_RECENTLY_VIEWED items', async () => {
      const patients: Patient[] = [];
      for (let i = 0; i < 10; i++) {
        const patient = await medplum.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: [`Patient${i}`], family: 'Test' }],
        });
        patients.push(patient);
      }

      const existingItems = patients.map((p, i) => ({
        resourceType: 'Patient',
        id: p.id,
        timestamp: Date.now() - i * 1000,
      }));

      const newPatient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['New'], family: 'Patient' }],
      });

      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify([
        { resourceType: 'Patient', id: newPatient.id, timestamp: Date.now() },
        ...existingItems.slice(0, 9),
      ]);

      await setup();

      await waitFor(() => {
        expect(screen.getByTestId(`action-patient-${newPatient.id}`)).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId(`action-patient-${newPatient.id}`));
      });

      const stored = JSON.parse(mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY]);
      expect(stored.length).toBe(10);
      expect(stored[0].id).toBe(newPatient.id);
    });

    test('handles localStorage setItem errors gracefully', async () => {
      const patient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Error'], family: 'Patient' }],
      });

      const recentItems = [{ resourceType: 'Patient', id: patient.id, timestamp: Date.now() }];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByTestId(`action-patient-${patient.id}`)).toBeInTheDocument();
      });

      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('Storage quota exceeded');
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId(`action-patient-${patient.id}`));
      });

      expect(mockNavigate).toHaveBeenCalledWith(`/Patient/${patient.id}`);
    });
  });

  describe('Resource display', () => {
    test('displays patient name when available', async () => {
      const patient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Wonderland' }],
        birthDate: '1990-01-01',
      });

      const recentItems = [{ resourceType: 'Patient', id: patient.id, timestamp: Date.now() }];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByText('Alice Wonderland')).toBeInTheDocument();
      });
    });

    test('displays patient ID when name is not available', async () => {
      const patient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        birthDate: '1990-01-01',
      });

      const recentItems = [{ resourceType: 'Patient', id: patient.id, timestamp: Date.now() }];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByText(patient.id as string)).toBeInTheDocument();
      });
    });

    test('displays birthDate as description for patients', async () => {
      const patient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['DOB'], family: 'Patient' }],
        birthDate: '1985-12-25',
      });

      const recentItems = [{ resourceType: 'Patient', id: patient.id, timestamp: Date.now() }];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByText('1985-12-25')).toBeInTheDocument();
      });
    });

    test('renders ResourceAvatar for patients', async () => {
      const patient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Avatar'], family: 'Test' }],
      });

      const recentItems = [{ resourceType: 'Patient', id: patient.id, timestamp: Date.now() }];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByTestId(`avatar-${patient.id}`)).toBeInTheDocument();
      });
    });
  });

  describe('Edge cases', () => {
    test('handles mixed valid and invalid recently viewed items', async () => {
      const validPatient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Valid'], family: 'Patient' }],
      });

      const now = Date.now();
      const recentItems = [
        { resourceType: 'Patient', id: validPatient.id, timestamp: now },
        { resourceType: 'Patient', id: 'nonexistent-id', timestamp: now - 1000 },
      ];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByTestId('action-group-Recent-Patients')).toBeInTheDocument();
      });

      expect(screen.getByText('Valid Patient')).toBeInTheDocument();
    });

    test('handles empty recently viewed list after filtering old items', async () => {
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      const recentItems = [
        { resourceType: 'Patient', id: 'old-1', timestamp: thirtyOneDaysAgo },
        { resourceType: 'Patient', id: 'old-2', timestamp: thirtyOneDaysAgo - 1000 },
      ];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByText(/Try/)).toBeInTheDocument();
      });
    });

    test('ignores non-Patient resource types in recently viewed', async () => {
      const patient = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Only'], family: 'Patient' }],
      });

      const recentItems = [
        { resourceType: 'Patient', id: patient.id, timestamp: Date.now() },
        { resourceType: 'Observation', id: 'obs-123', timestamp: Date.now() - 1000 }, // Should be ignored
      ];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByText('Only Patient')).toBeInTheDocument();
      });

      // Observation should not appear
      expect(screen.queryByText('Observation')).not.toBeInTheDocument();
    });
  });

  describe('Multiple recently viewed patients', () => {
    test('displays multiple patients in recently viewed', async () => {
      const patient1 = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['First'], family: 'Patient' }],
      });

      const patient2 = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Second'], family: 'Patient' }],
      });

      const patient3 = await medplum.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Third'], family: 'Patient' }],
      });

      const now = Date.now();
      const recentItems = [
        { resourceType: 'Patient', id: patient1.id, timestamp: now },
        { resourceType: 'Patient', id: patient2.id, timestamp: now - 1000 },
        { resourceType: 'Patient', id: patient3.id, timestamp: now - 2000 },
      ];
      mockLocalStorageData[RECENTLY_VIEWED_STORAGE_KEY] = JSON.stringify(recentItems);

      await setup();

      await waitFor(() => {
        expect(screen.getByTestId('action-group-Recent-Patients')).toBeInTheDocument();
      });

      expect(screen.getByText('First Patient')).toBeInTheDocument();
      expect(screen.getByText('Second Patient')).toBeInTheDocument();
      expect(screen.getByText('Third Patient')).toBeInTheDocument();
    });
  });
});
