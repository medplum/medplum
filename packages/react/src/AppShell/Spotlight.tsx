// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Kbd, Stack, Text } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import type { SpotlightActionData } from '@mantine/spotlight';
import { Spotlight as MantineSpotlight, spotlight } from '@mantine/spotlight';
import { formatHumanName, isUUID } from '@medplum/core';
import type { Patient, ServiceRequest, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { useMedplum, useMedplumNavigate } from '@medplum/react-hooks';
import { IconSearch } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import classes from './Spotlight.module.css';

const DEBOUNCE_MS = 200;

export type HeaderSearchTypes = Patient | ServiceRequest;

/**
 * A Spotlight entry. Setting `href` renders it as an anchor rather than a button, so the browser's
 * "Open link in new tab" context menu and Cmd/Ctrl+click both work. A plain click is handed to the
 * SPA router instead of triggering a full page load; pass `onClick` to do something other than
 * navigate to `href`.
 */
export interface SpotlightLinkAction extends SpotlightActionData {
  readonly href?: string;
}

interface SpotlightLinkActionGroup {
  readonly group: string;
  readonly actions: SpotlightLinkAction[];
}

export interface SpotlightProps {
  readonly patientsOnly?: boolean;
  readonly staticActions?: SpotlightLinkAction[];
}

function ShortcutHints(): JSX.Element {
  return (
    <Group gap="lg" justify="flex-start" align="center" wrap="wrap" className={classes.shortcutHints}>
      <Group gap={6} align="center" wrap="nowrap">
        <span className={classes.groupLabel}>Open search</span>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </Group>
      <Group gap={6} align="center" wrap="nowrap">
        <span className={classes.groupLabel}>Select</span>
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
      </Group>
      <Group gap={6} align="center" wrap="nowrap">
        <span className={classes.groupLabel}>Open / Go</span>
        <Kbd>↵</Kbd>
      </Group>
    </Group>
  );
}

interface SpotlightActionItemProps {
  readonly action: SpotlightLinkAction;
  readonly group?: string;
  readonly highlightQuery?: boolean;
}

/**
 * Renders one Spotlight entry, as an anchor when the action has an `href`.
 * @param props - The Spotlight action item props.
 * @param props.action - The action to render.
 * @param props.group - The name of the group the action belongs to.
 * @param props.highlightQuery - Whether to highlight the search query within the label.
 * @returns The rendered Spotlight action.
 */
function SpotlightActionItem({ action, group, highlightQuery }: SpotlightActionItemProps): JSX.Element {
  const navigate = useMedplumNavigate();
  const { href, onClick } = action;

  // Typed as HTMLElement because the action renders as an anchor whenever `href` is set.
  const handleClick: React.MouseEventHandler<HTMLElement> = (event) => {
    // Let the browser take modified clicks on a real link (new tab / new window / download)
    // and leave the palette open, since the current page isn't going anywhere.
    if (href && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
      return;
    }
    event.preventDefault();
    if (onClick) {
      // Same button-only typing as `component`/`href` below; the event is an anchor's when `href` is set.
      onClick(event as React.MouseEvent<HTMLButtonElement>);
    } else if (href) {
      navigate(href);
    }
    spotlight.close();
  };

  return (
    <MantineSpotlight.Action
      label={action.label}
      description={action.description}
      leftSection={action.leftSection}
      highlightQuery={highlightQuery}
      // Closing is handled in `handleClick` so modified clicks can keep the palette open.
      closeSpotlightOnTrigger={false}
      onClick={handleClick}
      // `component`/`href` pass through to the polymorphic UnstyledButton underneath, which
      // `SpotlightActionProps` types as button-only. `group` is a grouping/testing selector hook.
      {...({ ...(href && { component: 'a', href }), group } as Record<string, unknown>)}
    />
  );
}

/**
 * Filters action groups by query (matching label or description), dropping empty groups.
 * Mantine's `defaultSpotlightFilter` is internal to `@mantine/spotlight` and the composable API
 * has no `filter` prop, so the same label/description matching is applied here.
 * @param query - The search query.
 * @param groups - The action groups to filter.
 * @returns The filtered action groups.
 */
function filterActionGroups(query: string, groups: SpotlightLinkActionGroup[]): SpotlightLinkActionGroup[] {
  const q = query.trim().toLowerCase();
  const result: SpotlightLinkActionGroup[] = [];
  for (const { group, actions } of groups) {
    const matches = actions.filter(
      (a) => a.label?.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q)
    );
    if (matches.length > 0) {
      result.push({ group, actions: matches });
    }
  }
  return result;
}

interface SearchGraphQLResponse {
  readonly data: {
    readonly Patients1: Patient[] | undefined;
    readonly Patients2: Patient[] | undefined;
    readonly ServiceRequestList: ServiceRequest[] | undefined;
  };
}

function KeyboardHint(): JSX.Element {
  return (
    <Stack gap="xs" py="lg">
      <Text size="sm" c="dimmed">
        Press <Kbd>⌘</Kbd> + <Kbd>K</Kbd> to open Search next time.
      </Text>
      <Text size="sm" c="dimmed">
        (<Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> on Windows)
      </Text>
    </Stack>
  );
}

export function Spotlight({ patientsOnly, staticActions }: SpotlightProps): JSX.Element {
  const medplum = useMedplum();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [actions, setActions] = useState<SpotlightLinkActionGroup[]>([]);

  const debouncedSearch = useDebouncedCallback((searchQuery: string) => {
    const graphqlQuery = buildGraphQLQuery(searchQuery);

    if (patientsOnly) {
      // Only search patients
      medplum
        .graphql(graphqlQuery)
        .then((response: SearchGraphQLResponse) => {
          const resources = getResourcesFromResponse(response);
          const patients = resources.filter((r): r is Patient => r.resourceType === 'Patient');
          setActions(patientsToActions(patients));
        })
        .catch(console.error)
        .finally(() => setSearching(false));
    } else {
      // Search patients, service requests, and resource types
      Promise.all([
        medplum.graphql(graphqlQuery),
        medplum.valueSetExpand({
          url: 'https://medplum.com/fhir/ValueSet/resource-types',
          filter: searchQuery,
          count: 5,
        }),
      ])
        .then(([graphqlResponse, valueSetResult]) => {
          const resources = getResourcesFromResponse(graphqlResponse as SearchGraphQLResponse);
          const resourceTypes = valueSetResult.expansion?.contains ?? [];
          setActions(resourcesToActions(resources, resourceTypes));
        })
        .catch(console.error)
        .finally(() => setSearching(false));
    }
  }, DEBOUNCE_MS);

  const handleQueryChange = (newQuery: string): void => {
    setQuery(newQuery);
    if (!newQuery) {
      debouncedSearch.cancel();
      setSearching(false);
      setActions([]);
      return;
    }
    setSearching(true);
    debouncedSearch(newQuery);
  };

  const showStaticActions = !query && !!staticActions?.length;
  const filteredActions = query ? filterActionGroups(query, actions) : [];

  // Empty-state content, shown (via Spotlight.Empty) only when no actions are listed.
  let emptyContent: ReactNode;
  if (!showStaticActions && filteredActions.length === 0) {
    if (searching) {
      emptyContent = 'Searching...';
    } else if (query) {
      emptyContent = 'No results found';
    } else {
      emptyContent = <KeyboardHint />;
    }
  }

  return (
    <MantineSpotlight.Root
      query={query}
      onQueryChange={handleQueryChange}
      radius="md"
      classNames={{
        body: classes.body,
        content: classes.content,
        search: classes.search,
        actionsList: classes.actionsList,
        action: classes.action,
        actionSection: classes.actionSection,
        actionDescription: classes.actionDescription,
        actionsGroup: classes.actionsGroup,
        empty: classes.emptyState,
        footer: classes.footer,
      }}
    >
      <MantineSpotlight.Search
        leftSection={<IconSearch size="1.2rem" stroke={2} color="var(--mantine-color-gray-5)" />}
        placeholder="Start typing to search…"
        type="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        name={patientsOnly ? 'provider-spotlight-search' : 'spotlight-search'}
        // Tell common password managers to ignore this field
        {...({ 'data-1p-ignore': 'true', 'data-lpignore': 'true' } as any)}
        leftSectionProps={{ style: { marginLeft: 'calc(var(--mantine-spacing-md) - 12px)' } }}
      />

      <MantineSpotlight.ActionsList>
        {showStaticActions && (
          <MantineSpotlight.ActionsGroup label="Actions">
            {staticActions?.map((action) => (
              <SpotlightActionItem key={action.id} action={action} group="Actions" />
            ))}
          </MantineSpotlight.ActionsGroup>
        )}

        {!!query &&
          filteredActions.map((group) => (
            <MantineSpotlight.ActionsGroup key={group.group} label={group.group}>
              {group.actions.map((action) => (
                <SpotlightActionItem key={action.id} action={action} group={group.group} highlightQuery />
              ))}
            </MantineSpotlight.ActionsGroup>
          ))}

        {emptyContent && <MantineSpotlight.Empty>{emptyContent}</MantineSpotlight.Empty>}
      </MantineSpotlight.ActionsList>

      <MantineSpotlight.Footer>
        <ShortcutHints />
      </MantineSpotlight.Footer>
    </MantineSpotlight.Root>
  );
}

function buildGraphQLQuery(input: string): string {
  const escaped = JSON.stringify(input);
  if (isUUID(input)) {
    return `{
      Patients1: PatientList(_id: ${escaped}, _count: 1) {
        resourceType
        id
        identifier { system value }
        name { given family }
        birthDate
        photo { url contentType }
      }
      ServiceRequestList(_id: ${escaped}, _count: 1) {
        resourceType
        id
        identifier { system value }
        subject { display }
      }
    }`.replaceAll(/\s+/g, ' ');
  }
  return `{
    Patients1: PatientList(name: ${escaped}, _count: 5) {
      resourceType
      id
      identifier { system value }
      name { given family }
      birthDate
      photo { url contentType }
    }
    Patients2: PatientList(identifier: ${escaped}, _count: 5) {
      resourceType
      id
      identifier { system value }
      name { given family }
      birthDate
      photo { url contentType }
    }
    ServiceRequestList(identifier: ${escaped}, _count: 5) {
      resourceType
      id
      identifier { system value }
      subject { display }
    }
  }`.replaceAll(/\s+/g, ' ');
}

function getResourcesFromResponse(response: SearchGraphQLResponse): HeaderSearchTypes[] {
  const resources: HeaderSearchTypes[] = [];
  if (response.data.Patients1) {
    resources.push(...response.data.Patients1);
  }
  if (response.data.Patients2) {
    resources.push(...response.data.Patients2);
  }
  if (response.data.ServiceRequestList) {
    resources.push(...response.data.ServiceRequestList);
  }
  return dedupeResources(resources);
}

function dedupeResources(resources: HeaderSearchTypes[]): HeaderSearchTypes[] {
  const ids = new Set<string>();
  const result: HeaderSearchTypes[] = [];
  for (const resource of resources) {
    if (resource.id && !ids.has(resource.id)) {
      ids.add(resource.id);
      result.push(resource);
    }
  }
  return result;
}

function patientToAction(patient: Patient & { id: string }): SpotlightLinkAction {
  return {
    id: patient.id,
    href: `/Patient/${patient.id}`,
    label: patient.name ? formatHumanName(patient.name[0]) : patient.id,
    description: patient.birthDate,
    leftSection: <ResourceAvatar value={patient} radius="xl" size={24} />,
  };
}

function patientsToActions(patients: Patient[]): SpotlightLinkActionGroup[] {
  const patientActions: SpotlightLinkAction[] = patients
    .filter((p): p is Patient & { id: string } => Boolean(p.id))
    .map(patientToAction);

  return patientActions.length > 0 ? [{ group: 'Patients', actions: patientActions }] : [];
}

function resourcesToActions(
  resources: HeaderSearchTypes[],
  resourceTypes: ValueSetExpansionContains[]
): SpotlightLinkActionGroup[] {
  const result: SpotlightLinkActionGroup[] = [];

  // Resource types
  const resourceTypeActions: SpotlightLinkAction[] = resourceTypes.map((rt) => ({
    id: `resource-type-${rt.code}`,
    href: `/${rt.code}`,
    label: rt.display ?? rt.code ?? '',
    description: 'Resource Type',
  }));
  if (resourceTypeActions.length > 0) {
    result.push({ group: 'Resource Types', actions: resourceTypeActions });
  }

  const patientActions: SpotlightLinkAction[] = [];
  const serviceRequestActions: SpotlightLinkAction[] = [];

  for (const resource of resources) {
    if (resource.resourceType === 'Patient' && resource.id) {
      patientActions.push(patientToAction(resource as Patient & { id: string }));
    } else if (resource.resourceType === 'ServiceRequest' && resource.id) {
      serviceRequestActions.push({
        id: resource.id,
        href: `/ServiceRequest/${resource.id}`,
        label: resource.id,
        description: resource.subject?.display,
      });
    }
  }

  if (patientActions.length > 0) {
    result.push({ group: 'Patients', actions: patientActions });
  }
  if (serviceRequestActions.length > 0) {
    result.push({ group: 'Service Requests', actions: serviceRequestActions });
  }

  return result;
}
