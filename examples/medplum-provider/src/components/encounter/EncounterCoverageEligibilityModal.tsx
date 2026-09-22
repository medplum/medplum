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
  Popover,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { createReference, formatDateTime, getDisplayString, getReferenceString } from '@medplum/core';
import type {
  Coverage,
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  Organization,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import { Modal, ResourceInput, useMedplum, useMedplumProfile, useResource, useSearchOne } from '@medplum/react';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { BILLING_ORGANIZATION_IDENTIFIER } from '../../utils/billing';
import { isSelfPayCoverage } from '../../utils/coverage';
import { showErrorNotification } from '../../utils/notifications';
import { BillingOrganizationOption } from '../billing/BillingOrganizationOption';
import { BenefitsTable } from '../insurance/BenefitsTable';

interface EncounterCoverageEligibilityModalProps {
  patient: Reference<Patient> | Patient;
  opened: boolean;
  onClose: () => void;
}

/**
 * Shows the patient's active insurance coverages on a visit and runs eligibility checks against them.
 * The eligibility request's provider defaults to the organization on the signed-in practitioner's
 * PractitionerRole. When the project has billing organizations, the Check Eligibility button first opens a
 * picker to bill the check under one of them, or as the practitioner themselves when left empty.
 * @param props - The EncounterCoverageEligibilityModal React props.
 * @returns The EncounterCoverageEligibilityModal React node.
 */
export function EncounterCoverageEligibilityModal(props: EncounterCoverageEligibilityModalProps): JSX.Element {
  const { patient: patientRef, opened, onClose } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const patient: Patient | undefined = useResource(patientRef);
  const [coverages, setCoverages] = useState<Coverage[]>([]);
  const [coverageLoading, setCoverageLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [practitionerRole, practitionerRoleLoading] = useSearchOne(
    'PractitionerRole',
    profile ? { practitioner: getReferenceString(profile) } : undefined,
    { enabled: opened && !!profile }
  );
  const [anyBillingOrganization, billingOrganizationLoading] = useSearchOne(
    'Organization',
    { identifier: BILLING_ORGANIZATION_IDENTIFIER },
    { enabled: opened }
  );

  useEffect(() => {
    if (!opened || !patient?.id) {
      return;
    }
    setCoverageLoading(true);
    setCoverages([]);
    medplum
      .searchResources('Coverage', `patient=Patient/${patient.id}&status=active`)
      .then((results) => {
        const filtered = results.filter((c) => !isSelfPayCoverage(c));
        setCoverages(filtered);
        setSelectedId(filtered[0]?.id ?? null);
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
              <CoverageCard
                key={coverage.id}
                coverage={coverage}
                patient={patient}
                defaultBillingOrganization={practitionerRole?.organization}
                canPickBillingOrganization={!!anyBillingOrganization}
                providerLoading={practitionerRoleLoading || billingOrganizationLoading}
              />
            ))}
        </Stack>
      )}
    </Modal>
  );
}

/**
 * Props for CoverageCard.
 * @param coverage - The coverage shown and checked.
 * @param patient - The patient the coverage belongs to.
 * @param defaultBillingOrganization - The organization on the practitioner's role, billed unless changed.
 * @param canPickBillingOrganization - Whether the project has billing organizations to choose from.
 * @param providerLoading - Whether the default billing organization is still being resolved.
 */
interface CoverageCardProps {
  coverage: Coverage;
  patient: Reference<Patient> | Patient;
  defaultBillingOrganization: Reference<Organization> | undefined;
  canPickBillingOrganization: boolean;
  providerLoading: boolean;
}

function CoverageCard(props: CoverageCardProps): JSX.Element {
  const {
    coverage,
    patient: patientRef,
    defaultBillingOrganization,
    canPickBillingOrganization,
    providerLoading,
  } = props;
  const patient = useResource(patientRef);
  const medplum = useMedplum();
  const profile = useMedplumProfile();
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

  const handleCheckEligibility = async (billingOrganization: Reference<Organization> | undefined): Promise<void> => {
    if (!profile || !coverage || !patient) {
      return;
    }
    const provider: Reference<Organization | Practitioner> =
      billingOrganization ?? createReference(profile as Practitioner);
    setCheckingEligibility(true);
    try {
      const requestBody: CoverageEligibilityRequest = {
        resourceType: 'CoverageEligibilityRequest',
        status: 'active',
        purpose: ['benefits'],
        created: new Date().toISOString(),
        patient: createReference(patient),
        insurer: coverage.payor?.[0] as Reference<Organization>,
        provider,
        insurance: [{ focal: true, coverage: createReference(coverage) }],
      };
      const savedRequest = await medplum.createResource(requestBody);
      setLatestRequest(savedRequest);
      try {
        const response = await medplum.post<CoverageEligibilityResponse>(
          medplum.fhirUrl('CoverageEligibilityRequest', savedRequest.id, '$submit')
        );
        setEligibilityResponse(response);
      } catch (err) {
        showErrorNotification(err);
      }
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
          <CheckEligibilityButton
            loading={checkingEligibility}
            disabled={providerLoading || !profile}
            practitionerName={profile ? getDisplayString(profile) : undefined}
            defaultBillingOrganization={defaultBillingOrganization}
            canPickBillingOrganization={canPickBillingOrganization}
            onCheck={(billingOrganization) => handleCheckEligibility(billingOrganization).catch(showErrorNotification)}
          />
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
        <DetailField
          label="Effective Date"
          value={coverage.period?.start ? formatDateTime(coverage.period.start) : '—'}
        />
        <DetailField label="End Date" value={coverage.period?.end ? formatDateTime(coverage.period.end) : '—'} />
      </SimpleGrid>

      <Divider />

      <Box>
        <Flex justify="space-between" align="center" style={{ cursor: 'pointer' }} onClick={toggleBenefits} py={4}>
          <Title order={5}>Plan Benefits</Title>
          <Group gap="xs">
            {benefitsLoading && <Loader size="xs" />}
            {latestRequest && (
              <Text size="xs" c="dimmed">
                Last checked: {formatDateTime(latestRequest.created ?? latestRequest.meta?.lastUpdated ?? '')}
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
                No eligibility check found. Click "Check Eligibility" to run a check.
              </Text>
            )}
            {!benefitsLoading && eligibilityResponse?.outcome === 'error' && (
              <Text size="sm" c="red">
                {eligibilityResponse.disposition ?? 'Eligibility check returned an error.'}
              </Text>
            )}
            {!benefitsLoading &&
              eligibilityResponse?.outcome !== 'error' &&
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

/**
 * Props for CheckEligibilityButton.
 * @param loading - Whether a check is running.
 * @param disabled - Whether the button is disabled.
 * @param practitionerName - The signed-in practitioner's name, shown as the alternative to an organization.
 * @param defaultBillingOrganization - The organization billed when the picker is not offered.
 * @param canPickBillingOrganization - Whether to offer the billing organization picker before running.
 * @param onCheck - Runs the check under the given billing organization, or the practitioner when undefined.
 */
interface CheckEligibilityButtonProps {
  loading: boolean;
  disabled: boolean;
  practitionerName: string | undefined;
  defaultBillingOrganization: Reference<Organization> | undefined;
  canPickBillingOrganization: boolean;
  onCheck: (billingOrganization: Reference<Organization> | undefined) => void;
}

/**
 * The Check Eligibility action. Without billing organizations it runs the check right away under the default
 * organization. With them, it opens a popover to pick a billing organization first. The picker opens empty
 * every time, and running with nothing picked bills under the practitioner themselves. The popover ignores
 * outside clicks because the organization dropdown renders in a portal; Cancel or Escape dismisses it.
 * @param props - The CheckEligibilityButton React props.
 * @returns The CheckEligibilityButton React node.
 */
function CheckEligibilityButton(props: CheckEligibilityButtonProps): JSX.Element {
  const { loading, disabled, practitionerName, defaultBillingOrganization, canPickBillingOrganization, onCheck } =
    props;
  const [pickerOpened, setPickerOpened] = useState(false);
  const [chosenOrganization, setChosenOrganization] = useState<Organization>();

  const openPicker = (): void => {
    setChosenOrganization(undefined);
    setPickerOpened(true);
  };

  if (!canPickBillingOrganization) {
    return (
      <Button
        size="xs"
        variant="light"
        color="blue"
        loading={loading}
        disabled={disabled}
        onClick={() => onCheck(defaultBillingOrganization)}
      >
        Check Eligibility
      </Button>
    );
  }

  return (
    <Popover
      opened={pickerOpened}
      onChange={setPickerOpened}
      position="bottom-end"
      width={340}
      shadow="md"
      closeOnClickOutside={false}
      withinPortal={false}
    >
      <Popover.Target>
        <Button
          size="xs"
          variant="light"
          color="blue"
          loading={loading}
          disabled={disabled}
          rightSection={<IconChevronDown size={14} />}
          onClick={openPicker}
        >
          Check Eligibility
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Box>
            <ResourceInput<Organization>
              label="Billing organization"
              name="billing-organization"
              resourceType="Organization"
              placeholder="Select organization to run check"
              searchCriteria={{ identifier: BILLING_ORGANIZATION_IDENTIFIER }}
              itemComponent={BillingOrganizationOption}
              onChange={setChosenOrganization}
            />
            <Text size="xs" c="dimmed" mt={4}>
              {chosenOrganization
                ? `The check runs under ${getDisplayString(chosenOrganization)}.`
                : `Leave empty to run the check as ${practitionerName ?? 'the practitioner'}.`}
            </Text>
          </Box>
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="subtle" color="gray" onClick={() => setPickerOpened(false)}>
              Cancel
            </Button>
            <Button
              size="xs"
              onClick={() => {
                setPickerOpened(false);
                onCheck(toReference(chosenOrganization));
              }}
            >
              {chosenOrganization ? 'Run as Organization' : 'Run as Practitioner'}
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
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

/**
 * Reference to a billing organization the user picked, or undefined when nothing is picked.
 * @param organization - The picked organization, or undefined when empty.
 * @returns The reference, or undefined.
 */
function toReference(organization: Organization | undefined): Reference<Organization> | undefined {
  return organization ? createReference(organization) : undefined;
}
