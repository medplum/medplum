// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SpotlightActionData, SpotlightActionGroupData } from '@mantine/spotlight';
import { Spotlight as MantineSpotlight } from '@mantine/spotlight';
import { formatHumanName, isUUID } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import type { MedplumNavigateFunction } from '@medplum/react-hooks';
import { useMedplum, useMedplumNavigate } from '@medplum/react-hooks';
import { Kbd, Text } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import React, { useCallback, useEffect, useState } from 'react';
import { ResourceAvatar } from '@medplum/react';
import classes from './Spotlight.module.css';

const RECENTLY_VIEWED_STORAGE_KEY = 'medplum-provider-spotlight-recently-viewed';
const MAX_RECENTLY_VIEWED = 10;

interface RecentlyViewedItem {
  resourceType: string;
  id: string;
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
          <br />(<Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> on Windows.)
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

      // Process all recently viewed patients
      for (const item of recentlyViewed) {
        if (item.resourceType === 'Patient' && item.id) {
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
        }
      }

      // Sort by timestamp (most recent first)
      actionsWithTimestamps.sort((a, b) => b.timestamp - a.timestamp);

      // Extract just the actions in sorted order
      const actions = actionsWithTimestamps.map((item) => item.action);

      if (actions.length > 0) {
        setActions([{ group: 'Recent Patients', actions }]);
        setNothingFoundMessage('No results found');
      } else {
        // Show keyboard shortcut hint when no valid recently viewed items
        setNothingFoundMessage(
          <Text size="sm" c="dimmed" py="lg">
            Try <Kbd>⌘</Kbd> + <Kbd>K</Kbd> to open Search next time.
            <br />
            <br />(<Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> on Windows.)
          </Text>
        );
        setActions([]);
      }
    } catch (error) {
      console.error('Failed to load recently viewed:', error);
      // Show keyboard shortcut hint on error
      setNothingFoundMessage(
        <Text size="sm" c="dimmed" py="lg">
          Try <Kbd>⌘</Kbd> + <Kbd>K</Kbd> to open Search next time.
          <br />
          <br />(<Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> on Windows.)
        </Text>
      );
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

    // Fetch patient results only (no resource types for Provider app)
    medplum
      .graphql(graphqlQuery)
      .then((graphqlResponse) => {
        const resources = getResourcesFromResponse(graphqlResponse as SearchGraphQLResponse);
        const newActions = resourcesToActions(resources, navigate);
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
        placeholder: 'Search patients…',
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
 * The search request is actually 2+ separate searches, which can include duplicates.
 * This function combines the results, de-dupes, and sorts by relevance.
 * @param response - The response from a search query.
 * @returns The resources to display in the autocomplete.
 */
function getResourcesFromResponse(response: SearchGraphQLResponse): Patient[] {
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
function dedupeResources(resources: Patient[]): Patient[] {
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

function resourcesToActions(resources: Patient[], navigate: MedplumNavigateFunction): SpotlightActionGroupData[] {
  const patientActions: SpotlightActionData[] = [];

  for (const resource of resources) {
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

  if (patientActions.length > 0) {
    return [{ group: 'Patients', actions: patientActions }];
  }
  return [];
}

/**
 * Tracks an individual patient as recently viewed in localStorage.
 * @param resourceType - The resource type (always 'Patient' in Provider app).
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
 * Gets the list of recently viewed patients from localStorage.
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
