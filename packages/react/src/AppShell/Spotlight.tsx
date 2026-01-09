// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Kbd, Stack, Text } from '@mantine/core';
import type { SpotlightActionData, SpotlightActionGroupData } from '@mantine/spotlight';
import { Spotlight as MantineSpotlight } from '@mantine/spotlight';
import { formatHumanName, isUUID, normalizeErrorString } from '@medplum/core';
import type { Patient, ValueSetExpansionContains } from '@medplum/fhirtypes';
import type { MedplumNavigateFunction } from '@medplum/react-hooks';
import { useMedplum, useMedplumNavigate } from '@medplum/react-hooks';
import { IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import React, { useCallback, useEffect, useState } from 'react';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import classes from './Spotlight.module.css';

export type HeaderSearchTypes = Patient;

const MAX_RECENTLY_VIEWED = 10;

export interface SpotlightProps {
  patientsOnly?: boolean;
}

function getStorageKey(patientsOnly: boolean): string {
  return patientsOnly ? 'medplum-provider-spotlight-recently-viewed' : 'medplum-spotlight-recently-viewed';
}

interface RecentlyViewedItem {
  resourceType: string;
  id?: string; // undefined or empty string means it's a resource type page, not an individual resource
  timestamp: number;
}

interface ActionWithTimestamp {
  action: SpotlightActionData;
  timestamp: number;
}

function KeyboardShortcutHint({ error }: { error?: unknown }): JSX.Element {
  return (
    <Stack gap="xs" py="lg">
      {error !== undefined && (
        <Text size="sm" c="red">
          {normalizeErrorString(error)}
        </Text>
      )}
      <Text size="sm" c="dimmed">
        Try <Kbd>⌘</Kbd> + <Kbd>K</Kbd> to open Search next time.
      </Text>
      <Text size="sm" c="dimmed">
        (<Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> on Windows.)
      </Text>
    </Stack>
  );
}

export function Spotlight({ patientsOnly = false }: SpotlightProps = {}): JSX.Element {
  const medplum = useMedplum();
  const navigate = useMedplumNavigate();
  const [nothingFoundMessage, setNothingFoundMessage] = useState<React.ReactNode>(undefined);
  const [actions, setActions] = useState<SpotlightActionGroupData[]>([]);
  const storageKey = getStorageKey(patientsOnly);

  const loadRecentlyViewed = useCallback(async (): Promise<void> => {
    const recentlyViewed = getRecentlyViewed(storageKey, patientsOnly);
    if (recentlyViewed.length === 0) {
      setNothingFoundMessage(<KeyboardShortcutHint />);
      setActions([]);
      return;
    }

    setNothingFoundMessage('Loading recently viewed...');

    try {
      const actionsWithTimestamps = await buildRecentlyViewedActions(
        recentlyViewed,
        medplum,
        navigate,
        storageKey,
        patientsOnly
      );
      const sortedActions = sortRecentlyViewedActions(actionsWithTimestamps);

      if (sortedActions.length === 0) {
        setNothingFoundMessage(<KeyboardShortcutHint />);
        setActions([]);
        return;
      }

      setActions([{ group: patientsOnly ? 'Recent Patients' : 'Recent', actions: sortedActions }]);
      setNothingFoundMessage('No results found');
    } catch (error) {
      setNothingFoundMessage(<KeyboardShortcutHint error={error} />);
      setActions([]);
    }
  }, [medplum, navigate, storageKey, patientsOnly]);

  useEffect(() => {
    loadRecentlyViewed().catch((error) => {
      setNothingFoundMessage(normalizeErrorString(error));
    });
  }, [loadRecentlyViewed]);

  const performSearch = useCallback(
    async (query: string): Promise<void> => {
      setNothingFoundMessage('Searching...');

      try {
        const patients = await searchPatients(medplum, query);

        if (patientsOnly) {
          setActions(resourcesToActions(patients, [], navigate, storageKey, false));
        } else {
          const valueSetResult = await medplum.valueSetExpand({
            url: 'https://medplum.com/fhir/ValueSet/resource-types',
            filter: query,
            count: 5,
          });

          const resourceTypes = valueSetResult.expansion?.contains ?? [];
          setActions(resourcesToActions(patients, resourceTypes, navigate, storageKey, false));
        }
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setNothingFoundMessage('No results found');
      }
    },
    [medplum, navigate, patientsOnly, storageKey]
  );

  const handleQueryChange = (query: string): void => {
    if (!query) {
      loadRecentlyViewed().catch((error) => {
        setNothingFoundMessage(normalizeErrorString(error));
      });
      return;
    }

    performSearch(query).catch((error) => {
      setNothingFoundMessage(normalizeErrorString(error));
    });
  };

  return (
    <MantineSpotlight
      actions={actions}
      nothingFound={nothingFoundMessage}
      radius="md"
      highlightQuery
      searchProps={
        {
          leftSection: <IconSearch size="1.2rem" stroke={2} color="var(--mantine-color-gray-5)" />,
          placeholder: patientsOnly ? 'Search patients…' : 'Start typing to search…',
          type: 'search',
          autoComplete: 'off',
          autoCorrect: 'off',
          spellCheck: false,
          name: patientsOnly ? 'provider-spotlight-search' : 'spotlight-search',
          inputProps: {
            // Tell common password managers to ignore this field
            'data-1p-ignore': 'true',
            'data-lpignore': 'true',
          },
          leftSectionProps: {
            style: { marginLeft: 'calc(var(--mantine-spacing-md) - 12px)' },
          },
        } as any
      }
      classNames={{
        body: classes.body,
        content: classes.content,
        search: classes.search,
        actionsList: classes.actionsList,
        action: classes.action,
        actionSection: classes.actionSection,
        actionDescription: classes.actionDescription,
        actionsGroup: classes.actionsGroup,
      }}
      onQueryChange={handleQueryChange}
    />
  );
}

/**
 * Searches for patients using the Medplum client search (with caching).
 * @param medplum - The Medplum client.
 * @param query - The search query.
 * @returns A de-duped list of matching patients.
 */
async function searchPatients(medplum: ReturnType<typeof useMedplum>, query: string): Promise<Patient[]> {
  if (isUUID(query)) {
    return medplum.searchResources('Patient', { _id: query, _count: '1' });
  }

  return medplum.searchResources('Patient', {
    _filter: `name co "${query}" or identifier eq "${query}"`,
    _count: '5',
  });
}

function resourcesToActions(
  resources: HeaderSearchTypes[],
  resourceTypes: ValueSetExpansionContains[],
  navigate: MedplumNavigateFunction,
  storageKey: string,
  isRecentlyViewed = false
): SpotlightActionGroupData[] {
  const patientActions: SpotlightActionData[] = resources
    .filter(
      (resource): resource is Patient & { id: string } => resource.resourceType === 'Patient' && Boolean(resource.id)
    )
    .map((resource) => ({
      id: resource.id,
      label: resource.name ? formatHumanName(resource.name[0]) : resource.id,
      description: resource.birthDate,
      leftSection: <ResourceAvatar value={resource} radius="xl" size={24} />,
      onClick: () => {
        trackRecentlyViewed(storageKey, resource.resourceType, resource.id);
        navigate(`/Patient/${resource.id}`);
      },
    }));

  const resourceTypeActions: SpotlightActionData[] = resourceTypes.map((rt) => ({
    id: `resource-type-${rt.code}`,
    label: rt.display ?? rt.code ?? '',
    description: 'Resource Type',
    onClick: () => {
      trackRecentlyViewedResourceType(storageKey, rt.code ?? '');
      navigate(`/${rt.code}`);
    },
  }));

  if (isRecentlyViewed && patientActions.length > 0) {
    return [{ group: 'Recent', actions: patientActions }];
  }

  const result = [];
  if (resourceTypeActions.length > 0) {
    result.push({ group: 'Resource Types', actions: resourceTypeActions });
  }
  if (patientActions.length > 0) {
    result.push({ group: 'Patients', actions: patientActions });
  }
  return result;
}

/**
 * Tracks an individual resource as recently viewed in localStorage.
 * @param storageKey - The localStorage key to use.
 * @param resourceType - The resource type (e.g., 'Patient').
 * @param id - The resource ID.
 */
function trackRecentlyViewed(storageKey: string, resourceType: string, id: string): void {
  try {
    const stored = localStorage.getItem(storageKey);
    let recentlyViewed: RecentlyViewedItem[] = stored ? JSON.parse(stored) : [];

    // Remove existing entry if it exists
    recentlyViewed = recentlyViewed.filter((item) => !(item.resourceType === resourceType && item.id === id));

    // Add new entry at the beginning
    recentlyViewed.unshift({
      resourceType,
      id,
      timestamp: Date.now(),
    });

    // Keep only the most recent items
    recentlyViewed = recentlyViewed.slice(0, MAX_RECENTLY_VIEWED);

    localStorage.setItem(storageKey, JSON.stringify(recentlyViewed));
  } catch (error) {
    console.error('Failed to track recently viewed:', error);
  }
}

/**
 * Tracks a resource type page as recently viewed in localStorage.
 * @param storageKey - The localStorage key to use.
 * @param resourceType - The resource type (e.g., 'Patient', 'ServiceRequest', 'Observation').
 */
function trackRecentlyViewedResourceType(storageKey: string, resourceType: string): void {
  try {
    const stored = localStorage.getItem(storageKey);
    let recentlyViewed: RecentlyViewedItem[] = stored ? JSON.parse(stored) : [];

    // Remove existing entry if it exists (resource type pages have no id)
    recentlyViewed = recentlyViewed.filter((item) => !(item.resourceType === resourceType && !item.id));

    // Add new entry at the beginning
    recentlyViewed.unshift({
      resourceType,
      id: undefined,
      timestamp: Date.now(),
    });

    // Keep only the most recent items
    recentlyViewed = recentlyViewed.slice(0, MAX_RECENTLY_VIEWED);

    localStorage.setItem(storageKey, JSON.stringify(recentlyViewed));
  } catch (error) {
    console.error('Failed to track recently viewed resource type:', error);
  }
}

/**
 * Gets the list of recently viewed resources from localStorage.
 * @param storageKey - The localStorage key to use.
 * @param patientsOnly - If true, filter to only Patient resources.
 * @returns Array of recently viewed items, sorted by most recent first.
 */
function getRecentlyViewed(storageKey: string, patientsOnly: boolean): RecentlyViewedItem[] {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      return [];
    }
    const recentlyViewed: RecentlyViewedItem[] = JSON.parse(stored);
    // Filter out items older than 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let filtered = recentlyViewed.filter((item) => item.timestamp > thirtyDaysAgo);

    // If patientsOnly, filter to only Patient resources with IDs
    if (patientsOnly) {
      filtered = filtered.filter((item) => item.resourceType === 'Patient' && item.id);
    }

    return filtered;
  } catch (error) {
    console.error('Failed to get recently viewed:', error);
    return [];
  }
}

async function buildRecentlyViewedActions(
  items: RecentlyViewedItem[],
  medplum: ReturnType<typeof useMedplum>,
  navigate: MedplumNavigateFunction,
  storageKey: string,
  patientsOnly: boolean
): Promise<ActionWithTimestamp[]> {
  const actions: ActionWithTimestamp[] = [];

  for (const item of items) {
    const action = await buildActionForItem(item, medplum, navigate, storageKey, patientsOnly);
    if (action) {
      actions.push(action);
    }
  }

  return actions;
}

async function buildActionForItem(
  item: RecentlyViewedItem,
  medplum: ReturnType<typeof useMedplum>,
  navigate: MedplumNavigateFunction,
  storageKey: string,
  patientsOnly: boolean
): Promise<ActionWithTimestamp | undefined> {
  if (isPatientRecentlyViewed(item)) {
    return buildPatientAction(item, medplum, navigate, storageKey);
  }

  // Skip resource type pages if patientsOnly
  if (!patientsOnly && isResourceTypePage(item)) {
    return buildResourceTypeAction(item, navigate, storageKey);
  }

  return undefined;
}

async function buildPatientAction(
  item: RecentlyViewedItem & { resourceType: 'Patient'; id: string },
  medplum: ReturnType<typeof useMedplum>,
  navigate: MedplumNavigateFunction,
  storageKey: string
): Promise<ActionWithTimestamp | undefined> {
  try {
    const resource = await medplum.readResource('Patient', item.id);
    if (!resource || !resource.id) {
      return undefined;
    }

    return {
      action: {
        id: `patient-${resource.id}`,
        label: resource.name ? formatHumanName(resource.name[0]) : resource.id,
        description: resource.birthDate,
        leftSection: <ResourceAvatar value={resource} radius="xl" size={24} />,
        onClick: () => {
          trackRecentlyViewed(storageKey, 'Patient', resource.id);
          navigate(`/Patient/${resource.id}`);
        },
      },
      timestamp: item.timestamp,
    };
  } catch {
    // Resource might have been deleted, skip it
    return undefined;
  }
}

function buildResourceTypeAction(
  item: RecentlyViewedItem,
  navigate: MedplumNavigateFunction,
  storageKey: string
): ActionWithTimestamp {
  return {
    action: {
      id: `resource-type-${item.resourceType}`,
      label: item.resourceType,
      description: 'Resource Type',
      onClick: () => {
        trackRecentlyViewedResourceType(storageKey, item.resourceType);
        navigate(`/${item.resourceType}`);
      },
    },
    timestamp: item.timestamp,
  };
}

function sortRecentlyViewedActions(actions: ActionWithTimestamp[]): SpotlightActionData[] {
  return [...actions].sort((a, b) => b.timestamp - a.timestamp).map((item) => item.action);
}

function isPatientRecentlyViewed(
  item: RecentlyViewedItem
): item is RecentlyViewedItem & { resourceType: 'Patient'; id: string } {
  return item.resourceType === 'Patient' && Boolean(item.id);
}

function isResourceTypePage(item: RecentlyViewedItem): boolean {
  return !item.id;
}
