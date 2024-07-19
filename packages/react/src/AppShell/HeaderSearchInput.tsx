import { formatHumanName, getDisplayString, getReferenceString, isUUID } from '@medplum/core';
import { Patient, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum, useMedplumNavigate } from '@medplum/react-hooks';
import { IconSearch } from '@tabler/icons-react';
import { forwardRef, useCallback } from 'react';
import { AsyncAutocomplete, AsyncAutocompleteOption } from '../AsyncAutocomplete/AsyncAutocomplete';
import classes from './HeaderSearchInput.module.css';
import { Group, Text } from '@mantine/core';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';

export type HeaderSearchTypes = Patient | ServiceRequest;

interface SearchGraphQLResponse {
  readonly data: {
    readonly Patients1: Patient[] | undefined;
    readonly Patients2: Patient[] | undefined;
    readonly ServiceRequestList: ServiceRequest[] | undefined;
  };
}

function toOption(resource: HeaderSearchTypes): AsyncAutocompleteOption<HeaderSearchTypes> {
  return {
    value: resource.id as string,
    label: getDisplayString(resource),
    resource,
  };
}

export interface HeaderSearchInputProps {
  readonly pathname?: string;
  readonly searchParams?: URLSearchParams;
}

export function HeaderSearchInput(props: HeaderSearchInputProps): JSX.Element {
  const navigate = useMedplumNavigate();
  const medplum = useMedplum();

  const loadData = useCallback(
    async (input: string, signal: AbortSignal): Promise<HeaderSearchTypes[]> => {
      const query = buildGraphQLQuery(input);
      const options = { signal };
      const response = (await medplum.graphql(query, undefined, undefined, options)) as SearchGraphQLResponse;
      return getResourcesFromResponse(response, input);
    },
    [medplum]
  );

  const handleSelect = useCallback(
    (item: HeaderSearchTypes[]): void => {
      if (item.length > 0) {
        navigate(`/${getReferenceString(item[0])}`);
      }
    },
    [navigate]
  );

  return (
    <AsyncAutocomplete
      key={`${props.pathname}?${props.searchParams}`}
      size="sm"
      radius="md"
      className={classes.searchInput}
      leftSection={<IconSearch size={16} />}
      placeholder="Search"
      itemComponent={ItemComponent}
      toOption={toOption}
      onChange={handleSelect}
      loadOptions={loadData}
      maxValues={0}
      clearable={false}
    />
  );
}

const ItemComponent = forwardRef<HTMLDivElement, any>(
  ({ resource, active: _active, ...others }: AsyncAutocompleteOption<HeaderSearchTypes>, ref) => {
    let helpText: string | undefined = undefined;

    if (resource.resourceType === 'Patient') {
      helpText = resource.birthDate;
    } else if (resource.resourceType === 'ServiceRequest') {
      helpText = resource.subject?.display;
    }

    return (
      <div ref={ref} {...others}>
        <Group wrap="nowrap">
          <ResourceAvatar value={resource} />
          <div>
            <Text>{getDisplayString(resource)}</Text>
            <Text size="xs" c="dimmed">
              {helpText}
            </Text>
          </div>
        </Group>
      </div>
    );
  }
);

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
      ServiceRequestList(_id: ${escaped}, _count: 1) {
        resourceType
        id
        identifier {
          system
          value
        }
        subject {
          display
        }
      }
    }`.replace(/\s+/g, ' ');
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
    ServiceRequestList(identifier: ${escaped}, _count: 5) {
      resourceType
      id
      identifier {
        system
        value
      }
      subject {
        display
      }
    }
  }`.replace(/\s+/g, ' ');
}

/**
 * Returns a de-duped and sorted list of resources from the search response.
 * The search request is actually 3+ separate searches, which can include duplicates.
 * This function combines the results, de-dupes, and sorts by relevance.
 * @param response - The response from a search query.
 * @param query - The user entered search query.
 * @returns The resources to display in the autocomplete.
 */
function getResourcesFromResponse(response: SearchGraphQLResponse, query: string): HeaderSearchTypes[] {
  const resources = [];
  if (response.data.Patients1) {
    resources.push(...response.data.Patients1);
  }
  if (response.data.Patients2) {
    resources.push(...response.data.Patients2);
  }
  if (response.data.ServiceRequestList) {
    resources.push(...response.data.ServiceRequestList);
  }
  return sortByRelevance(dedupeResources(resources), query).slice(0, 5);
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

/**
 * Sorts an array of resources by relevance.
 * @param resources - The candidate resources.
 * @param query - The user entered search string.
 * @returns The sorted array of resources.
 */
function sortByRelevance(resources: HeaderSearchTypes[], query: string): HeaderSearchTypes[] {
  return resources.sort((a: HeaderSearchTypes, b: HeaderSearchTypes) => {
    return getResourceScore(b, query) - getResourceScore(a, query);
  });
}

/**
 * Calculates a relevance score of a candidate resource.
 * Higher scores are better.
 * @param resource - The candidate resource.
 * @param query - The user entered search string.
 * @returns The relevance score of the candidate resource.
 */
function getResourceScore(resource: HeaderSearchTypes, query: string): number {
  let bestScore = 0;

  if (resource.identifier) {
    for (const identifier of resource.identifier) {
      bestScore = Math.max(bestScore, getStringScore(identifier.value, query));
    }
  }

  if (resource.resourceType === 'Patient' && resource.name) {
    for (const name of resource.name) {
      bestScore = Math.max(bestScore, getStringScore(formatHumanName(name), query));
    }
  }

  return bestScore;
}

/**
 * Calculates a relevance score of a candidate display string.
 * Higher scores are better.
 * @param str - The candidate display string.
 * @param query - The user entered search string.
 * @returns The relevance score of the candidate string.
 */
function getStringScore(str: string | undefined, query: string): number {
  if (!str) {
    return 0;
  }
  const index = str.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) {
    return 0;
  }
  return 100 - index;
}
