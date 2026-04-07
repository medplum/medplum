// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Flex,
  Group,
  Loader,
  Modal,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { createReference, formatDate, getReferenceString } from '@medplum/core';
import type {
  Bot,
  Coverage,
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  Organization,
  Patient,
  Reference,
} from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile, useResource, useSearchOne } from '@medplum/react';
import { IconChevronDown, IconChevronUp, IconCircleOff } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { BenefitsTable } from '../insurance/BenefitsTable';

interface EncounterCoverageEligibilityModalProps {
  patient: Reference<Patient> | Patient;
  opened: boolean;
  onClose: () => void;
}

export function EncounterCoverageEligibilityModal(props: EncounterCoverageEligibilityModalProps): JSX.Element {
  const { patient: patientRef, opened, onClose } = props;
  const medplum = useMedplum();
  const patient: Patient | undefined = useResource(patientRef);
  const [coverages, setCoverages] = useState<Coverage[]>([]);
  const [coverageLoading, setCoverageLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [eligibilityBot] = useSearchOne('Bot', {
    identifier: 'https://www.medplum.com/bots|eligibility',
  });

  useEffect(() => {
    if (!opened || !patient?.id) {
      return;
    }
    setCoverageLoading(true);
    setCoverages([]);
    medplum
      .searchResources('Coverage', `patient=Patient/${patient.id}&status=active`)
      .then((results) => {
        const sorted = results.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setCoverages(sorted);
        setSelectedId(sorted[0]?.id ?? null);
      })
      .catch(showErrorNotification)
      .finally(() => setCoverageLoading(false));
  }, [opened, patient?.id, medplum]);

  return (
    <Modal opened={opened} onClose={onClose} title="Insurance" size="xl">
      {coverageLoading && <CoverageSkeleton />}
      {!coverageLoading && coverages.length === 0 && (
        <Text c="dimmed" size="sm">
          No active coverage found for this patient.
        </Text>
      )}
      {!coverageLoading && coverages.length > 0 && patient && (
        <Stack gap="md">
          {coverages.length > 1 && (
            <Select
              value={selectedId}
              onChange={setSelectedId}
              data={coverages.map((c) => ({
                value: c.id as string,
                label: `${c.payor?.[0]?.display ?? 'Unknown'} — ${getCoverageType(c)}`,
              }))}
            />
          )}
          {coverages
            .filter((c) => c.id === selectedId)
            .map((coverage) => (
              <CoverageCard key={coverage.id} coverage={coverage} patient={patient} eligibilityBot={eligibilityBot} />
            ))}
        </Stack>
      )}
    </Modal>
  );
}

interface CoverageCardProps {
  coverage: Coverage;
  patient: Reference<Patient> | Patient;
  eligibilityBot: Bot | undefined;
}

function CoverageCard(props: CoverageCardProps): JSX.Element {
  const { coverage, patient: patientRef, eligibilityBot } = props;
  const patient = useResource(patientRef);
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [practitionerRole] = useSearchOne(
    'PractitionerRole',
    profile ? { practitioner: getReferenceString(profile) } : undefined,
    { enabled: !!profile }
  );
  const [benefitsOpened, { toggle: toggleBenefits }] = useDisclosure(false);
  const [eligibilityResponse, setEligibilityResponse] = useState<CoverageEligibilityResponse | undefined>();
  const [latestRequest, setLatestRequest] = useState<CoverageEligibilityRequest | undefined>();
  const [benefitsLoading, setBenefitsLoading] = useState(false);
  const [checkingEligibility, setCheckingEligibility] = useState(false);

  const fetchLatestRequestAndResponse = useCallback(async (): Promise<void> => {
    if (!coverage.id || !patient) {
      return;
    }
    setBenefitsLoading(true);
    try {
      const requests = await medplum.searchResources(
        'CoverageEligibilityRequest',
        new URLSearchParams({ patient: getReferenceString(patient), _count: '10', _sort: '-_lastUpdated' })
      );
      const req = requests.find((r) =>
        r.insurance?.some((ins) => ins.coverage?.reference === getReferenceString(coverage))
      );
      setLatestRequest(req);
      if (!req?.id) {
        return;
      }
      const responses = await medplum.searchResources(
        'CoverageEligibilityResponse',
        new URLSearchParams({ request: getReferenceString(req), _count: '1' })
      );
      setEligibilityResponse(responses[0]);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setBenefitsLoading(false);
    }
  }, [coverage, patient, medplum]);

  useEffect(() => {
    fetchLatestRequestAndResponse().catch(showErrorNotification);
  }, [fetchLatestRequestAndResponse]);

  const handleCheckEligibility = async (): Promise<void> => {
    if (!eligibilityBot || !practitionerRole || !coverage || !patient) {
      return;
    }
    setCheckingEligibility(true);
    try {
      const requestBody: CoverageEligibilityRequest = {
        resourceType: 'CoverageEligibilityRequest',
        status: 'active',
        purpose: ['benefits'],
        created: new Date().toISOString(),
        patient: createReference(patient),
        insurer: coverage.payor?.[0] as Reference<Organization>,
        provider: practitionerRole.organization,
        insurance: [{ focal: true, coverage: createReference(coverage) }],
      };
      const savedRequest = await medplum.createResource(requestBody);
      setLatestRequest(savedRequest);
      try {
        await medplum.executeBot(eligibilityBot.id as string, savedRequest, 'application/fhir+json');
      } catch (err) {
        let errorMessage: string | undefined;
        try {
          const parsed = JSON.parse((err as Error).message);
          errorMessage = parsed?.errorMessage;
          notifications.show({
            color: 'red',
            icon: <IconCircleOff />,
            title: 'Error',
            message: errorMessage,
          });
        } catch {
          showErrorNotification(err);
        }
      }
      const responses = await medplum.searchResources(
        'CoverageEligibilityResponse',
        new URLSearchParams({ request: getReferenceString(savedRequest), _count: '1' })
      );
      setEligibilityResponse(responses[0]);
    } finally {
      setCheckingEligibility(false);
    }
  };

  return (
    <Stack gap="md">
      <Flex justify="space-between" align="flex-start" gap="md">
        <Box>
          <Title order={4}>{coverage.payor?.[0]?.display ?? 'Unknown Payor'}</Title>
          <Text size="sm" c="dimmed">
            {getPlanLabel(coverage)}
          </Text>
        </Box>
        <Group gap="xs" style={{ flexShrink: 0 }}>
          {eligibilityBot ? (
            <Button
              size="xs"
              variant="light"
              color="blue"
              loading={checkingEligibility}
              onClick={handleCheckEligibility}
            >
              Check Eligibility
            </Button>
          ) : (
            <Button size="xs" variant="light" color="gray">
              Contact Support
            </Button>
          )}
          <Badge color={getStatusColor(coverage.status)} variant="light">
            {capitalize(coverage.status ?? 'unknown')}
          </Badge>
        </Group>
      </Flex>

      <SimpleGrid cols={2} spacing="md">
        <DetailField label="Subscriber" value={getSubscriberText(coverage)} />
        <DetailField label="Type" value={getCoverageType(coverage)} />
        <DetailField label="Patient ID" value={coverage.subscriberId ?? coverage.identifier?.[0]?.value ?? '—'} />
        <DetailField label="Group Number" value={getGroupNumber(coverage)} />
        <DetailField label="Effective Date" value={coverage.period?.start ? formatDate(coverage.period.start) : '—'} />
        <DetailField label="End Date" value={coverage.period?.end ? formatDate(coverage.period.end) : '—'} />
      </SimpleGrid>

      <Divider />

      <Box>
        <Flex justify="space-between" align="center" style={{ cursor: 'pointer' }} onClick={toggleBenefits} py={4}>
          <Title order={5}>Plan Benefits</Title>
          <Group gap="xs">
            {benefitsLoading && <Loader size="xs" />}
            {latestRequest && (
              <Text size="xs" c="dimmed">
                Last checked: {formatDate(latestRequest.created ?? latestRequest.meta?.lastUpdated ?? '')}
              </Text>
            )}
            {benefitsOpened ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
          </Group>
        </Flex>
        <Divider />
        <Collapse in={benefitsOpened}>
          <Box pt="md">
            {!benefitsLoading && !eligibilityResponse && (
              <Text size="sm" c="dimmed">
                {eligibilityBot
                  ? 'No eligibility check found. Click "Check Eligibility" to run a check.'
                  : 'No eligibility check found. Contact support to enable eligibility checks.'}
              </Text>
            )}
            {!benefitsLoading &&
              eligibilityResponse?.insurance?.map((ins, i) => {
                const items = ins.item;
                if (!items || items.length === 0) {
                  return (
                    <Text key={i} size="sm" c="dimmed">
                      No benefit items in the eligibility response.
                    </Text>
                  );
                }
                return <BenefitsTable key={i} items={items} />;
              })}
          </Box>
        </Collapse>
      </Box>
    </Stack>
  );
}

function DetailField({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Box>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={500}>
        {value}
      </Text>
    </Box>
  );
}

function CoverageSkeleton(): JSX.Element {
  return (
    <Stack gap="md">
      <Skeleton height={20} width="60%" />
      <Skeleton height={14} width="40%" />
      <SimpleGrid cols={2} spacing="md">
        {Array.from({ length: 6 }).map((_, i) => (
          <Box key={i}>
            <Skeleton height={12} width="50%" mb={4} />
            <Skeleton height={16} width="70%" />
          </Box>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

function getPlanLabel(coverage: Coverage): string {
  const planName = coverage.class?.find((c) => c.type?.coding?.[0]?.code === 'plan')?.name;
  const planType = coverage.type?.text ?? coverage.type?.coding?.[0]?.display;
  if (planName && planType) {
    return `${planName} • ${planType}`;
  }
  return planName ?? planType ?? '';
}

function getSubscriberText(coverage: Coverage): string {
  const name = coverage.subscriber?.display;
  const relationship = coverage.relationship?.coding?.[0]?.display ?? coverage.relationship?.text;
  if (name && relationship) {
    return `${capitalize(relationship)} (${name})`;
  }
  return name ?? relationship ?? '—';
}

function getCoverageType(coverage: Coverage): string {
  if (coverage.order === 1) {
    return 'Primary';
  }
  if (coverage.order === 2) {
    return 'Secondary';
  }
  if (coverage.order === 3) {
    return 'Tertiary';
  }
  return coverage.order ? `Order ${coverage.order}` : '—';
}

function getGroupNumber(coverage: Coverage): string {
  return coverage.class?.find((c) => c.type?.coding?.[0]?.code === 'group')?.value ?? '—';
}

function getStatusColor(status: string | undefined): string {
  switch (status) {
    case 'active':
      return 'green';
    case 'cancelled':
      return 'red';
    case 'entered-in-error':
      return 'orange';
    default:
      return 'gray';
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
