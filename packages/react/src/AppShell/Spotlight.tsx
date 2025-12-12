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
      interface ActionWithTimestamp {
        action: SpotlightActionData;
        timestamp: number;
      }

      const actionsWithTimestamps: ActionWithTimestamp[] = [];

      // Process all recently viewed items and fetch Patient resources
      for (const item of recentlyViewed) {
        if (item.resourceType === 'Patient' && item.id) {
          // Fetch individual Patient resource
          try {
            const resource = await medplum.readResource('Patient', item.id);
            if (resource) {
              actionsWithTimestamps.push({
                action: {
                  id: `patient-${resource.id}`,
                  label: resource.name ? formatHumanName(resource.name[0]) : resource.id,
                  description: resource.birthDate,
                  leftSection: <ResourceAvatar value={resource} radius="xl" size={24} />,
                  onClick: () => {
                    trackRecentlyViewed('Patient', resource.id as string);
                    navigate(`/Patient/${resource.id}`);
                  },
                },
                timestamp: item.timestamp,
              });
            }
          } catch {
            // Resource might have been deleted, skip it
          }
        } else if (!item.id || item.id === '') {
          // Resource type page (no id means it's a list page)
          actionsWithTimestamps.push({
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
          });
        }
      }

      // Sort by timestamp (most recent first)
      actionsWithTimestamps.sort((a, b) => b.timestamp - a.timestamp);

      // Extract just the actions in sorted order
      const actions = actionsWithTimestamps.map((item) => item.action);

      if (actions.length > 0) {
        setActions([{ group: 'Recent', actions }]);
        setNothingFoundMessage('No results found');
      } else {
        // Hide the actions list entirely when no recently viewed items
        setNothingFoundMessage(undefined);
        setActions([]);
      }
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

  const handleQueryChange = (query: string): void => {
    if (!query) {
      // When query is cleared, show recently viewed
      loadRecentlyViewed().catch((error) => {
        console.error('Failed to load recently viewed:', error);
      });
      return;
    }

    setNothingFoundMessage('Searching...');

    const graphqlQuery = buildGraphQLQuery(query);

    // Fetch both resource types and patient/service request results in parallel
    Promise.all([
      medplum.valueSetExpand({
        url: 'https://medplum.com/fhir/ValueSet/resource-types',
        filter: query,
        count: 5,
      }),
      medplum.graphql(graphqlQuery),
    ])
      .then(([valueSetResult, graphqlResponse]) => {
        const resourceTypes = valueSetResult.expansion?.contains ?? [];
        const resources = getResourcesFromResponse(graphqlResponse as SearchGraphQLResponse);
        const newActions = resourcesToActions(resources, resourceTypes, navigate, false);
        setActions(newActions);
      })
      .catch((error) => {
        console.error('Search failed:', error);
      })
      .finally(() => {
        setNothingFoundMessage('No results found');
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
    if (!ids.has(resource.id as string)) {
      ids.add(resource.id as string);
      result.push(resource);
    }
  }

  return result;
}

function resourcesToActions(
  resources: HeaderSearchTypes[],
  resourceTypes: ValueSetExpansionContains[],
  navigate: MedplumNavigateFunction,
  isRecentlyViewed = false
): SpotlightActionGroupData[] {
  const patientActions: SpotlightActionData[] = [];

  for (const resource of resources) {
    if (resource.resourceType === 'Patient') {
      patientActions.push({
        id: resource.id as string,
        label: resource.name ? formatHumanName(resource.name[0]) : resource.id,
        description: resource.birthDate,
        leftSection: <ResourceAvatar value={resource} radius="xl" size={24} />,
        onClick: () => {
          trackRecentlyViewed(resource.resourceType, resource.id as string);
          navigate(`/Patient/${resource.id}`);
        },
      });
    }
  }

  const resourceTypeActions: SpotlightActionData[] = resourceTypes.map((rt) => ({
    id: `resource-type-${rt.code}`,
    label: rt.display ?? rt.code ?? '',
    description: 'Resource Type',
    onClick: () => {
      trackRecentlyViewedResourceType(rt.code ?? '');
      navigate(`/${rt.code}`);
    },
  }));

  const result = [];
  if (isRecentlyViewed && patientActions.length > 0) {
    // Group recently viewed items together
    result.push({ group: 'Recent', actions: patientActions });
  } else {
    if (resourceTypeActions.length > 0) {
      result.push({ group: 'Resource Types', actions: resourceTypeActions });
    }
    if (patientActions.length > 0) {
      result.push({ group: 'Patients', actions: patientActions });
    }
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
