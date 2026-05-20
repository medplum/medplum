// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Divider, Flex, Paper, Skeleton, Stack } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { SearchRequest } from '@medplum/core';
import { createReference, getReferenceString, parseSearchRequest } from '@medplum/core';
import type { Coverage, CoverageEligibilityRequest, Organization, Reference } from '@medplum/fhirtypes';
import {
  ListDetailLayout,
  ListEmptyState,
  ListPagination,
  ListScrollArea,
  ListSkeleton,
  useMedplum,
  useMedplumProfile,
  useSearchOne,
} from '@medplum/react';
import { IconShieldCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { showErrorNotification } from '../../utils/notifications';
import { CoverageDetailPanel } from './CoverageDetailPanel';
import { CoverageSummary } from './CoverageSummary';
import { EligibilityListItem } from './EligibilityListItem';

export interface CoverageRequestInboxProps {
  readonly query: string;
  readonly patientId: string;
  readonly coverageId?: string;
  readonly requestId?: string;
  readonly onChange: (search: SearchRequest) => void;
  readonly getRequestHref: (coverage: Coverage, request: CoverageEligibilityRequest) => string;
}

export function CoverageRequestInbox(props: CoverageRequestInboxProps): JSX.Element {
  const { query, patientId, coverageId, requestId, onChange, getRequestHref } = props;
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  // Parse pagination params from query string — same pattern as TaskBoard
  const searchParams = useMemo(() => new URLSearchParams(query), [query]);
  const itemsPerPage = Number.parseInt(searchParams.get('_count') ?? '20', 10);
  const currentOffset = Number.parseInt(searchParams.get('_offset') ?? '0', 10);
  const currentSearch = useMemo(() => parseSearchRequest(`CoverageEligibilityRequest?${query}`), [query]);

  const [eligibilityBot] = useSearchOne('Bot', { identifier: 'https://www.medplum.com/bots|eligibility' });
  const [practitionerRole] = useSearchOne(
    'PractitionerRole',
    profile ? { practitioner: getReferenceString(profile) } : undefined,
    { enabled: !!profile }
  );

  const [coverage, setCoverage] = useState<Coverage>();
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [requests, setRequests] = useState<CoverageEligibilityRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [total, setTotal] = useState<number | undefined>();
  const [checkingEligibility, setCheckingEligibility] = useState(false);

  // Load the coverage resource
  useEffect(() => {
    if (!coverageId) {
      setCoverage(undefined);
      return;
    }
    setCoverageLoading(true);
    medplum
      .readResource('Coverage', coverageId)
      .then(setCoverage)
      .catch(showErrorNotification)
      .finally(() => setCoverageLoading(false));
  }, [medplum, coverageId]);

  // Fetch eligibility requests — same pattern as TaskBoard
  const fetchRequests = useCallback(async (): Promise<void> => {
    if (!coverageId) {
      return;
    }
    setRequestsLoading(true);
    try {
      const params = new URLSearchParams(query);
      params.set('patient', `Patient/${patientId}`);
      params.set('_total', 'accurate');
      const bundle = await medplum.search('CoverageEligibilityRequest', params.toString(), { cache: 'no-cache' });
      const results = (bundle.entry ?? [])
        .map((e) => e.resource as CoverageEligibilityRequest)
        .filter((r): r is CoverageEligibilityRequest => r !== undefined);
      setRequests(results);
      if (bundle.total !== undefined) {
        setTotal(bundle.total);
      }
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setRequestsLoading(false);
    }
  }, [medplum, patientId, coverageId, query]);

  useEffect(() => {
    fetchRequests().catch(showErrorNotification);
  }, [fetchRequests]);

  const handleCheckEligibility = async (): Promise<void> => {
    if (!eligibilityBot) {
      showErrorNotification(new Error('To enable Insurance Eligibility please contact support.'));
      return;
    }
    if (!practitionerRole) {
      showErrorNotification(new Error('No PractitionerRole found for the assigned practitioner.'));
      return;
    }
    if (!coverage) {
      return;
    }
    setCheckingEligibility(true);
    try {
      const requestBody: CoverageEligibilityRequest = {
        resourceType: 'CoverageEligibilityRequest',
        status: 'active',
        purpose: ['benefits'],
        created: new Date().toISOString(),
        patient: { reference: `Patient/${patientId}` },
        insurer: coverage.payor?.[0] as Reference<Organization>,
        provider: practitionerRole.organization,
        insurance: [{ focal: true, coverage: createReference(coverage) }],
      };
      const savedRequest = await medplum.createResource(requestBody);
      try {
        await medplum.executeBot(eligibilityBot.id, savedRequest, 'application/fhir+json');
      } catch (err) {
        let errorMessage: string | undefined;
        try {
          const parsed = JSON.parse((err as Error).message);
          errorMessage = parsed?.errorMessage;
          showNotification({ color: 'red', title: 'Error', message: errorMessage });
        } catch {
          showErrorNotification(err);
        }
      }
      await fetchRequests();
      navigate(getRequestHref(coverage, savedRequest))?.catch(console.error);
    } finally {
      setCheckingEligibility(false);
    }
  };

  if (!coverageId) {
    return <NoCoverageSelected />;
  }

  // Find the selected request from the list
  const selectedRequest = requestId ? requests.find((r) => r.id === requestId) : undefined;

  return (
    <ListDetailLayout>
      {/*
       * CoverageSummary has variable height, so the left column composes the
       * summary panel on top with the eligibility-checks list below. ListShell
       * isn't a good fit here because its header is sized to a single 64px row.
       */}
      <ListDetailLayout.Column width={350} bordered>
        <Flex direction="column" h="100%">
          <Paper>
            <Box p="md">
              {coverageLoading ? (
                <CoverageSkeleton />
              ) : (
                coverage && (
                  <CoverageSummary
                    coverage={coverage}
                    checking={checkingEligibility}
                    onCheckEligibility={handleCheckEligibility}
                  />
                )
              )}
            </Box>
          </Paper>
          <Divider />
          <Flex direction="column" style={{ flex: 1, minHeight: 0 }}>
            <ListScrollArea>
              {requestsLoading && <ListSkeleton rows={4} linesPerRow={2} />}
              {!requestsLoading && requests.length === 0 && (
                <ListEmptyState message="No eligibility checks found for this coverage." />
              )}
              {!requestsLoading && coverage && requests.length > 0 && (
                <Stack gap={2}>
                  {requests.map((req) => (
                    <EligibilityListItem
                      key={req.id}
                      request={req}
                      isSelected={req.id === requestId}
                      href={getRequestHref(coverage, req)}
                    />
                  ))}
                </Stack>
              )}
            </ListScrollArea>
            {!requestsLoading && (
              <ListPagination
                total={total}
                offset={currentOffset}
                pageSize={itemsPerPage}
                onOffsetChange={(offset) => onChange({ ...currentSearch, offset })}
              />
            )}
          </Flex>
        </Flex>
      </ListDetailLayout.Column>

      <ListDetailLayout.Column>
        {selectedRequest ? (
          <CoverageDetailPanel key={selectedRequest.id} request={selectedRequest} />
        ) : (
          <ListEmptyState message="Select an eligibility check to view details." />
        )}
      </ListDetailLayout.Column>
    </ListDetailLayout>
  );
}

function NoCoverageSelected(): JSX.Element {
  return (
    <ListEmptyState
      icon={<IconShieldCheck size={32} />}
      message="No coverage selected"
      description="Select a coverage to view details."
    />
  );
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function CoverageSkeleton(): JSX.Element {
  return (
    <Stack gap="xs">
      <Skeleton height={16} width="70%" />
      <Skeleton height={14} width="50%" />
      <Skeleton height={14} width="40%" />
    </Stack>
  );
}
