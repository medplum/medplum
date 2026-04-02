// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Box, Button, Divider, Flex, Paper, ScrollArea, Skeleton, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, formatDate, getReferenceString } from '@medplum/core';
import type {
  Coverage,
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  Organization,
  Reference,
} from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile, useSearchOne } from '@medplum/react';
import type { JSX } from 'react';
import React, { useCallback, useEffect, useState } from 'react';

import { useNavigate, useParams } from 'react-router';
import { EligibilityDetails } from '../../components/insurance/EligibilityDetails';
import { EligibilityListItem } from '../../components/insurance/EligibilityListItem';
import { showErrorNotification } from '../../utils/notifications';
import classes from './CoveragePage.module.css';

export function CoveragePage(): JSX.Element {
  const { patientId, coverageId, requestId } = useParams();
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  const [eligibilityBot, _eligibilityBotLoading] = useSearchOne('Bot', {
    identifier: 'https://www.medplum.com/bots|eligibility',
  });
  const [coverage, setCoverage] = useState<Coverage>();
  const [coverageLoading, setCoverageLoading] = useState(true);
  const [requests, setRequests] = useState<CoverageEligibilityRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<CoverageEligibilityRequest>();
  const [response, setResponse] = useState<CoverageEligibilityResponse>();
  const [responseLoading, setResponseLoading] = useState(false);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [practitionerRole, _practitionerRoleLoading] = useSearchOne(
    'PractitionerRole', 
    profile ? { practitioner: getReferenceString(profile) } : undefined,
    { enabled: !!profile }
  );

  // Fetch Coverage resource
  useEffect(() => {
    if (!coverageId) {
      return;
    }
    setCoverageLoading(true);
    medplum
      .readResource('Coverage', coverageId)
      .then((c) => setCoverage(c))
      .catch(showErrorNotification)
      .finally(() => setCoverageLoading(false));
  }, [medplum, coverageId]);

  // Fetch CoverageEligibilityRequests for this patient, filter by coverage
  const fetchRequests = useCallback(async (): Promise<void> => {
    if (!patientId || !coverageId) {
      return;
    }
    setRequestsLoading(true);
    try {
      const all = await medplum.searchResources(
        'CoverageEligibilityRequest',
        new URLSearchParams({
          patient: `Patient/${patientId}`,
          _count: '100',
          _sort: '-_lastUpdated',
        }),
        { cache: 'no-cache' }
      );

      const filtered = all.filter((req) =>
        req.insurance?.some(
          (ins) => ins.coverage?.reference === `Coverage/${coverageId}` || ins.coverage?.reference === coverageId
        )
      );

      setRequests(filtered);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setRequestsLoading(false);
    }
  }, [medplum, patientId, coverageId]);

  useEffect(() => {
    fetchRequests().catch(showErrorNotification);
  }, [fetchRequests]);

  // Sync selectedRequest with requestId from URL
  useEffect(() => {
    if (!requestId) {
      setSelectedRequest(undefined);
      setResponse(undefined);
      return;
    }
    const found = requests.find((r) => r.id === requestId);
    if (found) {
      setSelectedRequest(found);
    } else if (requestId) {
      medplum
        .readResource('CoverageEligibilityRequest', requestId)
        .then(setSelectedRequest)
        .catch(showErrorNotification);
    }
  }, [medplum, requestId, requests]);

  // Fetch response for selected request
  useEffect(() => {
    if (!selectedRequest?.id) {
      setResponse(undefined);
      return;
    }
    setResponseLoading(true);
    setResponse(undefined);
    medplum
      .searchResources(
        'CoverageEligibilityResponse',
        new URLSearchParams({
          request: `CoverageEligibilityRequest/${selectedRequest.id}`,
          _count: '1',
        })
      )
      .then((results) => setResponse(results[0]))
      .catch(showErrorNotification)
      .finally(() => setResponseLoading(false));
  }, [medplum, selectedRequest?.id]);

  const handleCheckEligibility = async (): Promise<void> => {
    if (!eligibilityBot) {
      showErrorNotification(new Error('To enable Insurance Eligibility please contact support.'));
      return;
    }
    if (!practitionerRole) {
      showErrorNotification(new Error('No PractitionerRole found for the assigned practitioner.'));
      return;
    }
    if (!coverage || !patientId) {
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
          showNotification({
            color: 'red',
            title: 'Error',
            message: errorMessage,
          });
        } catch {
          showErrorNotification(err);
        }
      }
      await fetchRequests();
      navigate(`/Patient/${patientId}/Coverage/${coverageId}/CoverageEligibilityRequest/${savedRequest.id}`)?.catch(
        console.error
      );
    } finally {
      setCheckingEligibility(false);
    }
  };

  const getRequestHref = (req: CoverageEligibilityRequest): string =>
    `/Patient/${patientId}/Coverage/${coverageId}/CoverageEligibilityRequest/${req.id}`;

  return (
    <Box w="100%" h="100%">
      <Flex h="100%">
        {/* Left panel */}
        <Box w={350} h="100%" className={classes.borderRight}>
          <Flex direction="column" h="100%">
            {/* Coverage summary */}
            <Paper>
              <Box p="md">
                {coverageLoading && <CoverageSkeleton />}
                {!coverageLoading && coverage && (
                  <CoverageSummary
                    coverage={coverage}
                    checking={checkingEligibility}
                    onCheckEligibility={handleCheckEligibility}
                  />
                )}
              </Box>
            </Paper>

            <Divider />

            {/* Eligibility request list */}
            <Paper style={{ flex: 1, overflow: 'hidden' }}>
              <ScrollArea h="100%" p="0.5rem">
                {requestsLoading && <ListSkeleton />}
                {!requestsLoading && requests.length === 0 && (
                  <Flex direction="column" justify="center" align="center" pt="xl">
                    <Text size="sm" c="dimmed">
                      No eligibility checks found for this coverage.
                    </Text>
                  </Flex>
                )}
                {!requestsLoading &&
                  requests.map((req, index) => (
                    <React.Fragment key={req.id}>
                      <EligibilityListItem request={req} isSelected={req.id === requestId} href={getRequestHref(req)} />
                      {index < requests.length - 1 && (
                        <Box px="0.5rem">
                          <Divider />
                        </Box>
                      )}
                    </React.Fragment>
                  ))}
              </ScrollArea>
            </Paper>
          </Flex>
        </Box>

        {/* Right panel */}
        <Box h="100%" style={{ flex: 1 }}>
          {selectedRequest ? (
            <EligibilityDetails
              key={selectedRequest.id}
              request={selectedRequest}
              response={response}
              loadingResponse={responseLoading}
            />
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
    </Box>
  );
}

interface CoverageSummaryProps {
  coverage: Coverage;
  checking: boolean;
  onCheckEligibility: () => void;
}

function CoverageSummary({ coverage, checking, onCheckEligibility }: CoverageSummaryProps): JSX.Element {
  const payorName = coverage.payor?.[0]?.display ?? coverage.payor?.[0]?.reference ?? 'Unknown Payor';

  const planName =
    coverage.class?.find((c) => c.type?.coding?.[0]?.code === 'plan')?.name ??
    coverage.type?.text ??
    coverage.type?.coding?.[0]?.display;

  const subscriberId = coverage.subscriberId ?? coverage.identifier?.[0]?.value;

  const periodText = coverage.period
    ? `${formatDate(coverage.period.start)} – ${formatDate(coverage.period.end)}`
    : undefined;

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="flex-start" gap="xs">
        <Title order={6} style={{ lineHeight: 1.3 }}>
          {payorName}
        </Title>
        <Button size="xs" variant="filled" loading={checking} onClick={onCheckEligibility} style={{ flexShrink: 0 }}>
          Check Eligibility
        </Button>
      </Flex>
      {planName && (
        <Text size="sm" c="dimmed">
          {planName}
        </Text>
      )}
      {subscriberId && (
        <Text size="sm">
          <Text span fw={500}>
            ID:{' '}
          </Text>
          {subscriberId}
        </Text>
      )}
      {periodText && (
        <Text size="xs" c="dimmed">
          {periodText}
        </Text>
      )}
      <Badge size="sm" color={getCoverageStatusColor(coverage.status)} variant="light" w="fit-content">
        {coverage.status ?? 'unknown'}
      </Badge>
    </Stack>
  );
}

function getCoverageStatusColor(status: string | undefined): string {
  switch (status) {
    case 'active':
      return 'green';
    case 'cancelled':
      return 'red';
    case 'entered-in-error':
      return 'orange';
    case 'draft':
    default:
      return 'gray';
  }
}

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
