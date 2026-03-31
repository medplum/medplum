// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  Grid,
  Group,
  Modal,
  Popover,
  Stack,
  Text,
} from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference, formatHumanName } from '@medplum/core';
import type {
  Bot,
  ChargeItem,
  Condition,
  Coverage,
  CoverageEligibilityResponse,
  Encounter,
  Patient,
  Practitioner,
  PractitionerRole,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconArrowUpRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { isSelfPayCoverage, SELF_PAY_VALUE } from '../../utils/coverage';
import { showErrorNotification } from '../../utils/notifications';

type BillingType = 'insurance' | 'self-pay';

function getPayerName(coverage: WithId<Coverage>): string {
  return coverage.payor?.[0]?.display ?? 'Unknown Payer';
}

function getMemberId(coverage: WithId<Coverage>): string {
  return coverage.subscriberId ?? '—';
}

function getGroupNumber(coverage: WithId<Coverage>): string {
  return coverage.class?.find((c) => c.type?.coding?.some((cod) => cod.code === 'group'))?.value ?? '—';
}

function getSubscriberName(coverage: WithId<Coverage>): string {
  return coverage.subscriber?.display ?? '—';
}

function formatDiagnosis(condition: Condition): string {
  const text = condition.code?.text ?? condition.code?.coding?.[0]?.display ?? 'Unknown';
  const icd = condition.code?.coding?.find((c) => c.system?.includes('icd-10'))?.code;
  return icd ? `${text} (${icd})` : text;
}

function formatBenefitDate(dateStr: string | undefined): string {
  if (!dateStr) {
    return '—';
  }
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

interface EligibilityResultProps {
  coverage: WithId<Coverage>;
  result: CoverageEligibilityResponse;
}

const EligibilityResult = ({ coverage, result }: EligibilityResultProps): JSX.Element => {
  const insurance = result.insurance?.[0];
  const isError = result.outcome === 'error';
  const errorText = result.error?.[0]?.code?.text ?? result.error?.[0]?.code?.coding?.[0]?.display;

  const deductible = insurance?.item?.find((i) =>
    i.category?.coding?.some((c) => c.code?.toLowerCase().includes('deductible'))
  );
  const copay = insurance?.item?.find((i) =>
    i.category?.coding?.some((c) => ['copay', 'copayment'].includes(c.code?.toLowerCase() ?? ''))
  );
  const oopMax = insurance?.item?.find((i) =>
    i.category?.coding?.some((c) => c.code?.toLowerCase().includes('out-of-pocket'))
  );

  let alertColor = 'orange';
  if (isError) {
    alertColor = 'red';
  } else if (insurance?.inforce) {
    alertColor = 'green';
  }

  return (
    <Alert color={alertColor} p="sm">
      <Group justify="space-between" mb={insurance || result.disposition ? 6 : 0}>
        <Text size="sm" fw={600}>
          {getPayerName(coverage)}
        </Text>
        {!isError && (
          <Badge color={insurance?.inforce ? 'green' : 'orange'} size="sm">
            {insurance?.inforce ? 'Active' : 'Inactive'}
          </Badge>
        )}
        {isError && (
          <Badge color="red" size="sm">
            Error
          </Badge>
        )}
      </Group>

      {isError && errorText && (
        <Text size="xs" c="dimmed">
          {errorText}
        </Text>
      )}

      {!isError && result.disposition && (
        <Text size="xs" c="dimmed" mb={insurance?.benefitPeriod || deductible || copay || oopMax ? 6 : 0}>
          {result.disposition}
        </Text>
      )}

      {!isError && insurance?.benefitPeriod && (
        <Text size="xs" c="dimmed">
          Benefit period: {formatBenefitDate(insurance.benefitPeriod.start)} –{' '}
          {formatBenefitDate(insurance.benefitPeriod.end)}
        </Text>
      )}

      {!isError && (deductible || copay || oopMax) && (
        <Grid gutter="xs" mt={6}>
          {deductible?.benefit?.[0] && (
            <Grid.Col span={4}>
              <Text size="xs" c="dimmed">
                Deductible
              </Text>
              <Text size="xs" fw={600}>
                {deductible.benefit[0].allowedMoney
                  ? `$${deductible.benefit[0].allowedMoney.value}`
                  : (deductible.benefit[0].allowedString ?? '—')}
              </Text>
            </Grid.Col>
          )}
          {copay?.benefit?.[0] && (
            <Grid.Col span={4}>
              <Text size="xs" c="dimmed">
                Copay
              </Text>
              <Text size="xs" fw={600}>
                {copay.benefit[0].allowedMoney
                  ? `$${copay.benefit[0].allowedMoney.value}`
                  : (copay.benefit[0].allowedString ?? '—')}
              </Text>
            </Grid.Col>
          )}
          {oopMax?.benefit?.[0] && (
            <Grid.Col span={4}>
              <Text size="xs" c="dimmed">
                OOP Max
              </Text>
              <Text size="xs" fw={600}>
                {oopMax.benefit[0].allowedMoney
                  ? `$${oopMax.benefit[0].allowedMoney.value}`
                  : (oopMax.benefit[0].allowedString ?? '—')}
              </Text>
            </Grid.Col>
          )}
        </Grid>
      )}
    </Alert>
  );
};

interface CoverageCardProps {
  coverage: WithId<Coverage>;
  selected: boolean;
  error?: string;
  onToggle: () => void;
}

const CoverageCard = ({ coverage, selected, error, onToggle }: CoverageCardProps): JSX.Element => {
  let borderColor: string | undefined;
  if (error) {
    borderColor = 'var(--mantine-color-red-6)';
  } else if (selected) {
    borderColor = 'var(--mantine-color-blue-6)';
  }

  return (
    <Card withBorder p="xs" style={{ borderColor, borderWidth: 2 }}>
      <Group justify="space-between" mb={6}>
        <Text size="xs" tt="uppercase" fw={600} c={error ? 'red' : 'dimmed'}>
          Coverage
        </Text>
        <Group gap="xs">
          {error && (
            <Popover width={280} position="bottom-end" withArrow shadow="md">
              <Popover.Target>
                <Badge color="red" size="sm" style={{ cursor: 'pointer' }}>
                  Error
                </Badge>
              </Popover.Target>
              <Popover.Dropdown>
                <Text size="sm" c="red">
                  {error}
                </Text>
              </Popover.Dropdown>
            </Popover>
          )}
          <Checkbox size="xs" checked={selected} onChange={onToggle} style={{ cursor: 'pointer' }} />
        </Group>
      </Group>
      <Grid gutter="xs">
        <Grid.Col span={6}>
          <Text size="sm" c="dimmed">
            Payer
          </Text>
          <Text size="md" fw={700}>
            {getPayerName(coverage)}
          </Text>
        </Grid.Col>
        <Grid.Col span={6}>
          <Text size="sm" c="dimmed">
            Member ID
          </Text>
          <Text size="md" fw={700}>
            {getMemberId(coverage)}
          </Text>
        </Grid.Col>
        <Grid.Col span={6}>
          <Text size="sm" c="dimmed">
            Group number
          </Text>
          <Text size="md" fw={700}>
            {getGroupNumber(coverage)}
          </Text>
        </Grid.Col>
        <Grid.Col span={6}>
          <Text size="sm" c="dimmed">
            Subscriber
          </Text>
          <Text size="md" fw={700}>
            {getSubscriberName(coverage)}
          </Text>
        </Grid.Col>
      </Grid>
    </Card>
  );
};

interface ClaimPickerProps {
  patient: WithId<Patient>;
  conditions: Condition[];
  chargeItems: WithId<ChargeItem>[] | undefined;
  practitioner: WithId<Practitioner> | undefined;
  practitionerRole: WithId<PractitionerRole> | null | undefined;
  submitting: boolean;
  insuranceCoverages: WithId<Coverage>[];
  selfPayValue: string;
  initialBillingType: BillingType;
  eligibilityBot: WithId<Bot> | null | undefined;
  onClose: () => void;
  onConfirm: (coverageIds: string[]) => void;
}

const ClaimPicker = (props: ClaimPickerProps): JSX.Element => {
  const {
    patient,
    conditions,
    practitioner,
    practitionerRole,
    submitting,
    insuranceCoverages,
    selfPayValue,
    initialBillingType,
    eligibilityBot,
    onConfirm,
  } = props;

  const medplum = useMedplum();
  const [billingType, setBillingType] = useState<BillingType>(initialBillingType);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(initialBillingType === 'insurance' ? insuranceCoverages.map((c) => c.id) : [])
  );
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [eligibilityResults, setEligibilityResults] = useState<Map<string, CoverageEligibilityResponse>>();
  const [eligibilityErrors, setEligibilityErrors] = useState<Map<string, string>>(new Map());

  const patientName = patient.name?.[0] ? formatHumanName(patient.name[0]) : 'Unknown Patient';
  const practitionerName = practitioner?.name?.[0] ? formatHumanName(practitioner.name[0]) : '—';
  const diagnosisText = conditions.length > 0 ? conditions.map(formatDiagnosis).join(', ') : 'None';

  const clearEligibility = (): void => {
    setEligibilityResults(undefined);
    setEligibilityErrors(new Map());
  };

  const toggleCoverage = (id: string): void => {
    clearEligibility();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBillingTypeChange = (type: BillingType): void => {
    clearEligibility();
    setBillingType(type);
  };

  const handleCheckEligibility = async (): Promise<void> => {
    if (!eligibilityBot) {
      return;
    }
    if (!practitionerRole) {
      showErrorNotification(new Error('No PractitionerRole found for the assigned practitioner.'));
      return;
    }
    const selected = insuranceCoverages.filter((c) => selectedIds.has(c.id));
    setCheckingEligibility(true);
    setEligibilityResults(undefined);
    const results = new Map<string, CoverageEligibilityResponse>();
    const errors = new Map<string, string>();
    try {
      for (const coverage of selected) {
        const requestBody = {
          resourceType: 'CoverageEligibilityRequest' as const,
          status: 'active' as const,
          purpose: ['benefits' as const],
          created: new Date().toISOString(),
          patient: createReference(patient),
          insurer: coverage.payor?.[0] as { reference: string; display?: string },
          provider: practitionerRole.organization,
          insurance: [{ focal: true, coverage: createReference(coverage) }],
        };
        const savedRequest = await medplum.createResource(requestBody);
        try {
          const response = await medplum.executeBot(eligibilityBot.id, savedRequest, 'application/fhir+json');
          results.set(coverage.id, response as CoverageEligibilityResponse);
        } catch (err) {
          let errorMessage: string | undefined;
          try {
            const parsed = JSON.parse((err as Error).message);
            errorMessage = parsed?.errorMessage;
          } catch {
            // not a JSON error body
          }
          if (errorMessage) {
            errors.set(coverage.id, errorMessage);
          } else {
            showErrorNotification(err);
          }
        }
      }
      setEligibilityResults(results);
      setEligibilityErrors(errors);
    } finally {
      setCheckingEligibility(false);
    }
  };

  const handleConfirm = (): void => {
    if (billingType === 'self-pay') {
      onConfirm([selfPayValue]);
    } else {
      onConfirm(insuranceCoverages.filter((c) => selectedIds.has(c.id)).map((c) => c.id));
    }
  };

  const canSubmit = billingType === 'self-pay' || selectedIds.size > 0;
  const canCheckEligibility = !!eligibilityBot && billingType === 'insurance' && selectedIds.size > 0;

  return (
    <Stack gap="xl">
      <Text size="sm" c="dimmed">
        {patientName}
      </Text>
      <Box>
        <Text size="xs" tt="uppercase" fw={600} c="dimmed" mb={8}>
          Billing Type
        </Text>
        <Button.Group style={{ width: '100%' }}>
          <Button
            size="md"
            variant={billingType === 'insurance' ? 'filled' : 'default'}
            onClick={() => handleBillingTypeChange('insurance')}
            style={{ flex: 1 }}
            disabled={insuranceCoverages.length === 0}
          >
            Insurance pay
          </Button>
          <Button
            size="md"
            variant={billingType === 'self-pay' ? 'filled' : 'default'}
            onClick={() => handleBillingTypeChange('self-pay')}
            style={{ flex: 1 }}
          >
            Self-pay
          </Button>
        </Button.Group>
      </Box>

      {billingType === 'insurance' && insuranceCoverages.length > 0 && (
        <Box>
          <Group justify="space-between" mb={8}>
            <Text size="xs" tt="uppercase" fw={600} c="dimmed">
              Coverage on file
            </Text>
            {insuranceCoverages.length > 1 && (
              <Text
                size="xs"
                c="blue"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  clearEligibility();
                  setSelectedIds(
                    selectedIds.size === insuranceCoverages.length
                      ? new Set()
                      : new Set(insuranceCoverages.map((c) => c.id))
                  );
                }}
              >
                {selectedIds.size === insuranceCoverages.length ? 'Deselect all' : 'Select all'}
              </Text>
            )}
          </Group>
          <Box style={{ maxHeight: 320, overflowY: 'auto' }}>
            <Stack gap="sm" pr={6}>
              {insuranceCoverages.map((coverage) => (
                <CoverageCard
                  key={coverage.id}
                  coverage={coverage}
                  selected={selectedIds.has(coverage.id)}
                  error={eligibilityErrors.get(coverage.id)}
                  onToggle={() => toggleCoverage(coverage.id)}
                />
              ))}
            </Stack>
          </Box>
        </Box>
      )}

      {eligibilityResults && eligibilityResults.size > 0 && (
        <Box>
          <Text size="xs" tt="uppercase" fw={600} c="dimmed" mb={8}>
            Eligibility Results
          </Text>
          <Stack gap="sm">
            {insuranceCoverages
              .filter((c) => eligibilityResults.has(c.id))
              .map((coverage) => (
                <EligibilityResult
                  key={coverage.id}
                  coverage={coverage}
                  result={eligibilityResults.get(coverage.id) as CoverageEligibilityResponse}
                />
              ))}
          </Stack>
        </Box>
      )}

      <Divider />

      <Grid gutter="lg">
        <Grid.Col span={6}>
          <Text size="xs" c="dimmed" mb={4}>
            Diagnosis
          </Text>
          <Text size="sm" fw={600}>
            {diagnosisText}
          </Text>
        </Grid.Col>
        <Grid.Col span={6}>
          <Text size="xs" c="dimmed" mb={4}>
            Practitioner
          </Text>
          <Text size="sm" fw={600}>
            {practitionerName}
          </Text>
        </Grid.Col>
      </Grid>

      <Group justify="space-between">
        {eligibilityBot ? (
          <Button
            size="md"
            variant="outline"
            loading={checkingEligibility}
            disabled={!canCheckEligibility}
            onClick={handleCheckEligibility}
          >
            Check eligibility
          </Button>
        ) : (
          <Button size="md" variant="outline" onClick={() => window.open('https://www.medplum.com/contact', '_blank')}>
            Request insurance eligibility support
          </Button>
        )}
        <Button
          size="md"
          rightSection={<IconArrowUpRight size={16} />}
          loading={submitting}
          disabled={!canSubmit}
          onClick={handleConfirm}
        >
          Submit claim
        </Button>
      </Group>
    </Stack>
  );
};

export interface SubmitClaimModalProps {
  opened: boolean;
  submitting: boolean;
  coverages: WithId<Coverage>[];
  selectedCoverage: WithId<Coverage> | undefined;
  patient: WithId<Patient>;
  encounter: WithId<Encounter>;
  conditions: Condition[];
  chargeItems: WithId<ChargeItem>[] | undefined;
  practitioner: WithId<Practitioner> | undefined;
  practitionerRole: WithId<PractitionerRole> | null | undefined;
  eligibilityBot: WithId<Bot> | null | undefined;
  onClose: () => void;
  onConfirm: (coverageIds: string[]) => void;
}

export const SubmitClaimModal = (props: SubmitClaimModalProps): JSX.Element => {
  const {
    opened,
    submitting,
    coverages,
    selectedCoverage,
    patient,
    conditions,
    chargeItems,
    practitioner,
    practitionerRole,
    eligibilityBot,
    onClose,
    onConfirm,
  } = props;

  const selfPayCoverage = coverages.find(isSelfPayCoverage);
  const insuranceCoverages = coverages.filter((c) => !isSelfPayCoverage(c));
  const selfPayValue = selfPayCoverage?.id ?? SELF_PAY_VALUE;
  const initialBillingType: BillingType =
    insuranceCoverages.length > 0 && selectedCoverage && !isSelfPayCoverage(selectedCoverage)
      ? 'insurance'
      : 'self-pay';

  return (
    <Modal opened={opened} onClose={onClose} centered size="lg" padding="xl" title="Review before submitting claim">
      {opened && (
        <ClaimPicker
          patient={patient}
          conditions={conditions}
          chargeItems={chargeItems}
          practitioner={practitioner}
          practitionerRole={practitionerRole}
          submitting={submitting}
          insuranceCoverages={insuranceCoverages}
          selfPayValue={selfPayValue}
          initialBillingType={initialBillingType}
          eligibilityBot={eligibilityBot}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      )}
    </Modal>
  );
};
