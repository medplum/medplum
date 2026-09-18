// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { SearchRequest, WithId } from '@medplum/core';
import { DEFAULT_SEARCH_COUNT, formatSearchQuery, Operator, parseSearchRequest, resolveId } from '@medplum/core';
import type { CoverageEligibilityRequest } from '@medplum/fhirtypes';
import { ResourceBoard } from '@medplum/react';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { CheckEligibilityModal } from '../../components/insurance/CheckEligibilityModal';
import { CoverageDetailPanel } from '../../components/insurance/CoverageDetailPanel';
import { EligibilityListItem } from '../../components/insurance/EligibilityListItem';
import { showErrorNotification } from '../../utils/notifications';

/**
 * Eligibility board for a patient: every CoverageEligibilityRequest of the patient. The list is never filtered by
 * coverage (FHIR R4 defines no coverage search parameter on CoverageEligibilityRequest); the coverage in the path
 * (`/Patient/:patientId/Coverage/:coverageId`) is the default for new eligibility checks. The query string is the
 * source of truth for the rest of the search (sort, count, offset). With nothing selected, the first request of the
 * loaded page is selected automatically.
 * @returns The CoveragePage React node.
 */
export function CoveragePage(): JSX.Element {
  const { patientId, coverageId, requestId } = useParams() as {
    patientId: string;
    coverageId?: string;
    requestId?: string;
  };
  const navigate = useNavigate();
  const location = useLocation();
  const [checkOpened, { open: openCheck, close: closeCheck }] = useDisclosure(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const search = useMemo<SearchRequest>(() => {
    const parsed = parseSearchRequest(`CoverageEligibilityRequest${location.search}`);
    const extraFilters = (parsed.filters ?? []).filter((f) => f.code !== 'patient');
    return {
      resourceType: 'CoverageEligibilityRequest',
      filters: [{ code: 'patient', operator: Operator.EQUALS, value: `Patient/${patientId}` }, ...extraFilters],
      sortRules:
        parsed.sortRules && parsed.sortRules.length > 0
          ? parsed.sortRules
          : [{ code: '_lastUpdated', descending: true }],
      count: parsed.count ?? DEFAULT_SEARCH_COUNT,
      offset: parsed.offset ?? 0,
      total: 'accurate',
    };
  }, [location.search, patientId]);

  const toQuery = useCallback(
    (s: SearchRequest): string =>
      formatSearchQuery({ ...s, filters: (s.filters ?? []).filter((f) => f.code !== 'patient') }),
    []
  );

  useEffect(() => {
    const query = toQuery(search);
    if (query === location.search) {
      return;
    }
    navigate(`${location.pathname}${query}`, { replace: true })?.catch(console.error);
  }, [search, toQuery, location.search, location.pathname, navigate]);

  const requestUri = useCallback(
    (request: WithId<CoverageEligibilityRequest>, requestCoverageId: string | undefined): string => {
      const path = requestCoverageId
        ? `/Patient/${patientId}/Coverage/${requestCoverageId}/CoverageEligibilityRequest/${request.id}`
        : `/Patient/${patientId}/Coverage`;
      return `${path}${location.search}`;
    },
    [patientId, location.search]
  );

  /**
   * Reloads the board and selects the new request. Both updates run in one transition so the reload cannot settle
   * before the route change commits, which would otherwise let the board auto-select under the previous URL.
   * @param request - The eligibility request that was just created.
   */
  const handleCreated = (request: WithId<CoverageEligibilityRequest>): void => {
    startTransition(() => {
      setRefreshKey((key) => key + 1);
      navigate(requestUri(request, ownCoverageId(request) ?? coverageId))?.catch(console.error);
    });
  };

  return (
    <>
      <ResourceBoard<CoverageEligibilityRequest>
        search={search}
        selectedId={requestId}
        reloadKey={refreshKey}
        headerText="Eligibility Checks"
        headerActions={
          <Tooltip label="Check eligibility" position="bottom" openDelay={500}>
            <ActionIcon
              aria-label="Check eligibility"
              radius="xl"
              variant="filled"
              color="blue"
              size={32}
              onClick={openCheck}
            >
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
        }
        renderItem={(request, { selected }) => (
          <EligibilityListItem
            request={request}
            isSelected={selected}
            href={requestUri(request, coverageId ?? ownCoverageId(request))}
          />
        )}
        emptyList={
          <Box h="100%" p="lg">
            <Text c="dimmed" fw={500}>
              No eligibility checks found.
            </Text>
          </Box>
        }
        renderDetail={(request) => (
          <Box key={request.id} flex={1} miw={0} h="100%" style={{ overflow: 'auto' }}>
            <CoverageDetailPanel request={request} />
          </Box>
        )}
        emptyDetail={
          <Box flex={1} h="100%" p="lg">
            <Text c="dimmed">Select an eligibility check to view details.</Text>
          </Box>
        }
        onChange={(s) => navigate(`${location.pathname}${toQuery(s)}`)?.catch(console.error)}
        onSelectFirst={(request) =>
          navigate(requestUri(request, coverageId ?? ownCoverageId(request)), { replace: true })?.catch(console.error)
        }
        onError={showErrorNotification}
      />
      <CheckEligibilityModal
        opened={checkOpened}
        onClose={closeCheck}
        patient={{ reference: `Patient/${patientId}` }}
        defaultCoverageId={coverageId}
        onCreated={handleCreated}
      />
    </>
  );
}

/**
 * The coverage an eligibility request was checked against.
 * @param request - The eligibility request.
 * @returns The coverage id, if the request references one.
 */
function ownCoverageId(request: CoverageEligibilityRequest): string | undefined {
  return resolveId(request.insurance?.find((i) => i.coverage)?.coverage);
}
