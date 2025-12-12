// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Kbd, Text } from '@mantine/core';
import type { SpotlightActionData, SpotlightActionGroupData } from '@mantine/spotlight';
import { Spotlight as MantineSpotlight } from '@mantine/spotlight';
import { formatHumanName, isUUID } from '@medplum/core';
import type { Patient, ValueSetExpansionContains } from '@medplum/fhirtypes';
import type { MedplumNavigateFunction } from '@medplum/react-hooks';
import { useMedplum, useMedplumNavigate } from '@medplum/react-hooks';
import { IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import React, { useCallback, useEffect, useState } from 'react';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import classes from './Spotlight.module.css';

export type HeaderSearchTypes = Patient;

const RECENTLY_VIEWED_STORAGE_KEY = 'medplum-spotlight-recently-viewed';
const MAX_RECENTLY_VIEWED = 10;

interface RecentlyViewedItem {
  resourceType: string;
  id?: string; // undefined or empty string means it's a resource type page, not an individual resource
  timestamp: number;
}

interface SearchGraphQLResponse {
  readonly data: {
    readonly Patients1: Patient[] | undefined;
    readonly Patients2: Patient[] | undefined;
  };
}

interface ActionWithTimestamp {
  action: SpotlightActionData;
  timestamp: number;
}

export function Spotlight(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useMedplumNavigate();
  const [nothingFoundMessage, setNothingFoundMessage] = useState<React.ReactNode>(undefined);
  const [actions, setActions] = useState<SpotlightActionGroupData[]>([]);

  const loadRecentlyViewed = useCallback(async (): Promise<void> => {
    const recentlyViewed = getRecentlyViewed();
    if (recentlyViewed.length === 0) {
      // Show keyboard shortcut hint when no recently viewed items
      setNothingFoundMessage(
        <Text size="sm" c="dimmed" py="lg">
          Try <Kbd>⌘</Kbd> + <Kbd>K</Kbd> to open Search next time.
          <br />
          <br />( <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> on Windows.)
        </Text>
      );
      setActions([]);
      return;
    }

    setNothingFoundMessage('Loading recently viewed...');

    try {
      const actionsWithTimestamps = await buildRecentlyViewedActions(recentlyViewed, medplum, navigate);
      const sortedActions = sortRecentlyViewedActions(actionsWithTimestamps);

      if (sortedActions.length === 0) {
        setNothingFoundMessage(undefined);
        setActions([]);
        return;
      }

      setActions([{ group: 'Recent', actions: sortedActions }]);
      setNothingFoundMessage('No results found');
    } catch (error) {
      console.error('Failed to load recently viewed:', error);
      // Hide the actions list entirely on error with no results
      setNothingFoundMessage(undefined);
      setActions([]);
    }
  }, [medplum, navigate]);

  // Load recently viewed items when Spotlight opens (empty query)
  useEffect(() => {
    // Load recently viewed items on mount to show them when Spotlight first opens
    loadRecentlyViewed().catch((error) => {
      console.error('Failed to load recently viewed:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const performSearch = useCallback(
    async (query: string): Promise<void> => {
      setNothingFoundMessage('Searching...');

      try {
        const graphqlQuery = buildGraphQLQuery(query);
        const [valueSetResult, graphqlResponse] = await Promise.all([
          medplum.valueSetExpand({
            url: 'https://medplum.com/fhir/ValueSet/resource-types',
            filter: query,
            count: 5,
          }),
          medplum.graphql<SearchGraphQLResponse>(graphqlQuery),
        ]);

        const resourceTypes = valueSetResult.expansion?.contains ?? [];
        const resources = getResourcesFromResponse(graphqlResponse);
        setActions(resourcesToActions(resources, resourceTypes, navigate, false));
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setNothingFoundMessage('No results found');
      }
    },
    [medplum, navigate]
  );

  const handleQueryChange = (query: string): void => {
    if (!query) {
      // When query is cleared, show recently viewed
      loadRecentlyViewed().catch((error) => {
        console.error('Failed to load recently viewed:', error);
      });
      return;
    }

    performSearch(query).catch((error) => {
      console.error('Search failed:', error);
    });
  };

  return (
    <MantineSpotlight
      actions={actions}
      nothingFound={nothingFoundMessage}
      radius="md"
      highlightQuery
      searchProps={{
        leftSection: <IconSearch size="1.2rem" stroke={2} color="var(--mantine-color-gray-5)" />,
        placeholder: 'Start typing to search…',
        type: 'search',
        autoComplete: 'off',
        autoCorrect: 'off',
        spellCheck: false,
        name: 'spotlight-search',
        // Tell common password managers to ignore this field
        'data-1p-ignore': true,
        'data-lpignore': true,
        leftSectionProps: {
          style: { marginLeft: 'calc(var(--mantine-spacing-md) - 12px)' },
        },
      }}
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

function buildGraphQLQuery(input: string): string {
  const escaped = JSON.stringify(input);
  if (isUUID(input)) {
    return `{
      Patients1: PatientList(_id: ${escaped}, _count: 1) {
        resourceType
        id
        identifier {
          system
          value
        }
        name {
          given
          family
        }
        birthDate
      }
    }`.replaceAll(/\s+/g, ' ');
  }
  return `{
    Patients1: PatientList(name: ${escaped}, _count: 5) {
      resourceType
      id
      identifier {
        system
        value
      }
      name {
        given
        family
      }
      birthDate
    }
    Patients2: PatientList(identifier: ${escaped}, _count: 5) {
      resourceType
      id
      identifier {
        system
        value
      }
      name {
        given
        family
      }
      birthDate
    }
  }`.replaceAll(/\s+/g, ' ');
}

/**
 * Returns a de-duped and sorted list of resources from the search response.
 * The search request is actually 3+ separate searches, which can include duplicates.
 * This function combines the results, de-dupes, and sorts by relevance.
 * @param response - The response from a search query.
 * @returns The resources to display in the autocomplete.
 */
function getResourcesFromResponse(response: SearchGraphQLResponse): HeaderSearchTypes[] {
  const resources = [];
  if (response.data.Patients1) {
    resources.push(...response.data.Patients1);
  }
  if (response.data.Patients2) {
    resources.push(...response.data.Patients2);
  }
  return dedupeResources(resources);
}

/**
 * Removes duplicate resources from an array by ID.
 * @param resources - The array of resources with possible duplicates.
 * @returns The array of resources with no duplicates.
 */
function dedupeResources(resources: HeaderSearchTypes[]): HeaderSearchTypes[] {
  const ids = new Set<string>();
  const result = [];

  for (const resource of resources) {
    if (!resource.id || ids.has(resource.id)) {
      continue;
    }
    ids.add(resource.id);
    result.push(resource);
  }

  return result;
}

function resourcesToActions(
  resources: HeaderSearchTypes[],
  resourceTypes: ValueSetExpansionContains[],
  navigate: MedplumNavigateFunction,
  isRecentlyViewed = false
): SpotlightActionGroupData[] {
  const patientActions: SpotlightActionData[] = resources
    .filter((resource): resource is Patient & { id: string } => resource.resourceType === 'Patient' && Boolean(resource.id))
    .map((resource) => ({
      id: resource.id,
      label: resource.name ? formatHumanName(resource.name[0]) : resource.id,
      description: resource.birthDate,
      leftSection: <ResourceAvatar value={resource} radius="xl" size={24} />,
      onClick: () => {
        trackRecentlyViewed(resource.resourceType, resource.id);
        navigate(`/Patient/${resource.id}`);
      },
    }));

  const resourceTypeActions: SpotlightActionData[] = resourceTypes.map((rt) => ({
    id: `resource-type-${rt.code}`,
    label: rt.display ?? rt.code ?? '',
    description: 'Resource Type',
    onClick: () => {
      trackRecentlyViewedResourceType(rt.code ?? '');
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
 * @param resourceType - The resource type (e.g., 'Patient').
 * @param id - The resource ID.
 */
function trackRecentlyViewed(resourceType: string, id: string): void {
  try {
    const stored = localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
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

    localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(recentlyViewed));
  } catch (error) {
    console.error('Failed to track recently viewed:', error);
  }
}

/**
 * Tracks a resource type page as recently viewed in localStorage.
 * @param resourceType - The resource type (e.g., 'Patient', 'ServiceRequest', 'Observation').
 */
function trackRecentlyViewedResourceType(resourceType: string): void {
  try {
    const stored = localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
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

    localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(recentlyViewed));
  } catch (error) {
    console.error('Failed to track recently viewed resource type:', error);
  }
}

/**
 * Gets the list of recently viewed resources from localStorage.
 * @returns Array of recently viewed items, sorted by most recent first.
 */
function getRecentlyViewed(): RecentlyViewedItem[] {
  try {
    const stored = localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const recentlyViewed: RecentlyViewedItem[] = JSON.parse(stored);
    // Filter out items older than 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return recentlyViewed.filter((item) => item.timestamp > thirtyDaysAgo);
  } catch (error) {
    console.error('Failed to get recently viewed:', error);
    return [];
  }
}

async function buildRecentlyViewedActions(
  items: RecentlyViewedItem[],
  medplum: ReturnType<typeof useMedplum>,
  navigate: MedplumNavigateFunction
): Promise<ActionWithTimestamp[]> {
  const actions: ActionWithTimestamp[] = [];

  for (const item of items) {
    const action = await buildActionForItem(item, medplum, navigate);
    if (action) {
      actions.push(action);
    }
  }

  return actions;
}

async function buildActionForItem(
  item: RecentlyViewedItem,
  medplum: ReturnType<typeof useMedplum>,
  navigate: MedplumNavigateFunction
): Promise<ActionWithTimestamp | undefined> {
  if (isPatientRecentlyViewed(item)) {
    return buildPatientAction(item, medplum, navigate);
  }

  if (isResourceTypePage(item)) {
    return buildResourceTypeAction(item, navigate);
  }

  return undefined;
}

async function buildPatientAction(
  item: RecentlyViewedItem & { resourceType: 'Patient'; id: string },
  medplum: ReturnType<typeof useMedplum>,
  navigate: MedplumNavigateFunction
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
          trackRecentlyViewed('Patient', resource.id);
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
  navigate: MedplumNavigateFunction
): ActionWithTimestamp {
  return {
    action: {
      id: `resource-type-${item.resourceType}`,
      label: item.resourceType,
      description: 'Resource Type',
      onClick: () => {
        trackRecentlyViewedResourceType(item.resourceType);
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
