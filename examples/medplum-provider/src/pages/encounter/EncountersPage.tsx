// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Text } from '@mantine/core';
import type { MedplumClient, SearchRequest, WithId } from '@medplum/core';
import { DEFAULT_SEARCH_COUNT, formatSearchQuery, Operator, parseSearchRequest } from '@medplum/core';
import type { Encounter } from '@medplum/fhirtypes';
import { ResourceBoard } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { EncounterChart } from '../../components/encounter/EncounterChart';
import { showErrorNotification } from '../../utils/notifications';
import { EncounterListItem } from './EncounterListItem';

// The fields the list items render. _fields from the URL is deliberately not honored:
// legacy Visits-tab URLs carry a _fields set that omits type/participant, which would
// strip the title and practitioner from every row on a real server.
const ENCOUNTER_LIST_FIELDS = ['_lastUpdated', 'period', 'status', 'type', 'participant'];

export function EncountersPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { patientId, encounterId, taskId } = useParams() as {
    patientId: string;
    encounterId?: string;
    taskId?: string;
  };

  // The URL is the source of truth for the search. The patient filter is always rebuilt from
  // the route path, never trusted from the query string.
  const search = useMemo<SearchRequest>(() => {
    const parsed = parseSearchRequest(`Encounter${location.search}`);
    const extraFilters = (parsed.filters ?? []).filter((f) => f.code !== 'patient');
    return {
      resourceType: 'Encounter',
      filters: [{ code: 'patient', operator: Operator.EQUALS, value: patientId }, ...extraFilters],
      sortRules:
        parsed.sortRules && parsed.sortRules.length > 0
          ? parsed.sortRules
          : [{ code: '_lastUpdated', descending: true }],
      fields: ENCOUNTER_LIST_FIELDS,
      count: parsed.count ?? DEFAULT_SEARCH_COUNT,
      offset: parsed.offset ?? 0,
      total: 'accurate',
    };
  }, [location.search, patientId]);

  // Pin the normalized search into the URL (history replace) whenever the URL is missing any
  // part of it. formatSearchQuery is deterministic, so this converges after one redirect.
  // The pathname is kept as-is: it may extend past the encounter (e.g. /Task/:taskId).
  useEffect(() => {
    const query = formatSearchQuery(search);
    if (query === location.search) {
      return;
    }
    navigate(`${location.pathname}${query}`, { replace: true })?.catch(console.error);
  }, [search, location.search, location.pathname, navigate]);

  // Keep the current search query when navigating to an encounter.
  const encounterUri = useCallback(
    (id: string | undefined): string => `/Patient/${patientId}/Encounter/${id}${location.search}`,
    [patientId, location.search]
  );

  // Resolve an out-of-list selection silently (a stale/deleted encounter id shouldn't toast).
  const resolveSelected = useCallback(
    async (id: string, items: WithId<Encounter>[], client: MedplumClient): Promise<WithId<Encounter> | undefined> => {
      const found = items.find((e) => e.id === id);
      if (found) {
        return found;
      }
      try {
        return await client.readResource('Encounter', id);
      } catch {
        return undefined;
      }
    },
    []
  );

  return (
    <ResourceBoard<Encounter>
      search={search}
      selectedId={encounterId}
      resolveSelected={resolveSelected}
      headerText="Visits"
      renderItem={(encounter) => (
        <EncounterListItem
          encounter={encounter}
          selectedEncounterId={encounterId}
          getItemUri={(e) => encounterUri(e.id)}
        />
      )}
      emptyList={
        <Box h="100%" p="lg">
          <Text c="dimmed" fw={500}>
            No visits.
          </Text>
        </Box>
      }
      renderDetail={(encounter, ctx) => (
        <Box key={encounter.id} flex={1} miw={0} h="100%" style={{ overflow: 'auto' }}>
          <EncounterChart
            encounter={{ reference: `Encounter/${encounter.id}` }}
            task={taskId ? { reference: `Task/${taskId}` } : undefined}
            onEncounterChange={() => ctx.refresh().catch(showErrorNotification)}
          />
        </Box>
      )}
      emptyDetail={
        <Box flex={1} h="100%" p="lg">
          <Text c="dimmed">Select a visit to view its chart.</Text>
        </Box>
      }
      onSelectFirst={(encounter) => navigate(encounterUri(encounter.id), { replace: true })?.catch(console.error)}
      onChange={(s) => {
        navigate(`${location.pathname}${formatSearchQuery(s)}`)?.catch(console.error);
      }}
      onError={showErrorNotification}
    />
  );
}
