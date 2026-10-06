// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Text } from '@mantine/core';
import { formatHumanName, getDisplayString, getReferenceString, isUUID } from '@medplum/core';
import type { Patient, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum, useMedplumNavigate } from '@medplum/react-hooks';
import { IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { forwardRef, useCallback } from 'react';
import type { AsyncAutocompleteOption } from '../AsyncAutocomplete/AsyncAutocomplete';
import { AsyncAutocomplete } from '../AsyncAutocomplete/AsyncAutocomplete';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import classes from './HeaderSearchInput.module.css';

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

const ItemComponent = forwardRef<HTMLDivElement, AsyncAutocompleteOption<HeaderSearchTypes>>(
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

/**
 * FHIR search parameters that can be targeted directly from the nav search,
 * e.g. "email:homer@example.com". Both separators are accepted: ":" reads like
 * a search engine, "=" reads like a FHIR query string.
 */
const SEARCH_SHORTCUTS: Record<string, readonly HeaderSearchTypes['resourceType'][]> = {
  birthdate: ['Patient'],
  email: ['Patient'],
  identifier: ['Patient', 'ServiceRequest'],
  name: ['Patient'],
  phone: ['Patient'],
};

const PATIENT_SELECTION = 'resourceType id identifier { system value } name { given family } birthDate';
const SERVICE_REQUEST_SELECTION = 'resourceType id identifier { system value } subject { display }';

/**
 * Parses a "param:value" or "param=value" shortcut out of the search input.
 * @param input - The user entered search string.
 * @returns The search parameter and value, or undefined for a plain search.
 */
function parseSearchShortcut(input: string): { param: string; value: string } | undefined {
  const separatorIndex = input.search(/[:=]/);
  if (separatorIndex < 0) {
    return undefined;
  }
  const param = input.slice(0, separatorIndex).trim().toLowerCase();
  const value = input.slice(separatorIndex + 1).trim();
  // An unrecognized prefix falls through to a plain search, so a value that
  // merely contains a separator - a token search such as "http://acme.org|123"
  // - is still searched verbatim.
  if (!value || !Object.hasOwn(SEARCH_SHORTCUTS, param)) {
    return undefined;
  }
  return { param, value };
}

function buildGraphQLQuery(input: string): string {
  const escaped = JSON.stringify(input);
  if (isUUID(input)) {
    return `{
      Patients1: PatientList(_id: ${escaped}, _count: 1) {
        ${PATIENT_SELECTION}
      }
      ServiceRequestList(_id: ${escaped}, _count: 1) {
        ${SERVICE_REQUEST_SELECTION}
      }
    }`.replaceAll(/\s+/g, ' ');
  }
  const shortcut = parseSearchShortcut(input);
  if (shortcut) {
    const value = JSON.stringify(shortcut.value);
    const targets = SEARCH_SHORTCUTS[shortcut.param];
    const queries = [];
    if (targets.includes('Patient')) {
      queries.push(`Patients1: PatientList(${shortcut.param}: ${value}, _count: 5) { ${PATIENT_SELECTION} }`);
    }
    if (targets.includes('ServiceRequest')) {
      queries.push(`ServiceRequestList(${shortcut.param}: ${value}, _count: 5) { ${SERVICE_REQUEST_SELECTION} }`);
    }
    return `{ ${queries.join(' ')} }`.replaceAll(/\s+/g, ' ');
  }
  return `{
    Patients1: PatientList(name: ${escaped}, _count: 5) {
      ${PATIENT_SELECTION}
    }
    Patients2: PatientList(identifier: ${escaped}, _count: 5) {
      ${PATIENT_SELECTION}
    }
    ServiceRequestList(identifier: ${escaped}, _count: 5) {
      ${SERVICE_REQUEST_SELECTION}
    }
  }`.replaceAll(/\s+/g, ' ');
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
  const term = parseSearchShortcut(query)?.value ?? query;
  return sortByRelevance(dedupeResources(resources), term).slice(0, 5);
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
