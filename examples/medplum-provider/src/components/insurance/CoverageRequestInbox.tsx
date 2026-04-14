// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Center, Divider, Flex, Pagination, Paper, ScrollArea, Skeleton, Stack, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { SearchRequest } from '@medplum/core';
import { createReference, getReferenceString, parseSearchRequest } from '@medplum/core';
import type { Coverage, CoverageEligibilityRequest, Organization, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile, useSearchOne } from '@medplum/react';
import { IconShieldCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { showErrorNotification } from '../../utils/notifications';
import { CoverageDetailPanel } from './CoverageDetailPanel';
import classes from './CoverageDetailPanel.module.css';
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
  const currentPage = Math.floor(currentOffset / itemsPerPage) + 1;
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
      .then((c) => setCoverage(c))
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
    <Flex h="100%" style={{ flex: 1 }}>
      {/* Left panel — coverage summary + eligibility request list */}
      <Box w={350} h="100%" className={classes.borderRight}>
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
          <Paper style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ScrollArea flex={1} p="0.5rem">
              {requestsLoading && <ListSkeleton />}
              {!requestsLoading && requests.length === 0 && (
                <Flex direction="column" justify="center" align="center" pt="xl">
                  <Text size="sm" c="dimmed">
                    No eligibility checks found for this coverage.
                  </Text>
                </Flex>
              )}
              {!requestsLoading &&
                coverage &&
                requests.map((req, index) => (
                  <React.Fragment key={req.id}>
                    <EligibilityListItem
                      request={req}
                      isSelected={req.id === requestId}
                      href={getRequestHref(coverage, req)}
                    />
                    {index < requests.length - 1 && (
                      <Box px="0.5rem">
                        <Divider />
                      </Box>
                    )}
                  </React.Fragment>
                ))}
            </ScrollArea>
            {!requestsLoading && total !== undefined && total > itemsPerPage && (
              <Box p="md">
                <Center>
                  <Pagination
                    value={currentPage}
                    total={Math.ceil(total / itemsPerPage)}
                    onChange={(page) => {
                      const offset = (page - 1) * itemsPerPage;
                      onChange({ ...currentSearch, offset });
                    }}
                    size="sm"
                    siblings={1}
                    boundaries={1}
                  />
                </Center>
              </Box>
            )}
          </Paper>
        </Flex>
      </Box>

      {/* Right panel — eligibility request + response detail */}
      <Box h="100%" style={{ flex: 1 }}>
        {selectedRequest ? (
          <CoverageDetailPanel key={selectedRequest.id} request={selectedRequest} />
        ) : (
          <Flex h="100%" justify="center" align="center">
            <Stack align="center" gap="xs">
              <Text size="md" c="dimmed">
                Select an eligibility check to view details.
              </Text>
            </Stack>
          </Flex>
        )}
      </Box>
    </Flex>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function NoCoverageSelected(): JSX.Element {
  return (
    <Flex direction="column" style={{ flex: 1 }} h="100%" justify="center" align="center">
      <Stack align="center" gap="md">
        <IconShieldCheck size={64} color="var(--mantine-color-gray-4)" />
        <Text size="sm" c="dimmed" ta="center">
          Select a coverage to view details.
        </Text>
      </Stack>
    </Flex>
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

function ListSkeleton(): JSX.Element {
  return (
    <Stack gap="md" p="md">
      {Array.from({ length: 4 }).map((_, i) => (
        <Stack key={i} gap="xs">
          <Skeleton height={14} width="80%" />
          <Skeleton height={12} width="50%" />
          <Divider />
        </Stack>
      ))}
    </Stack>
  );
}
