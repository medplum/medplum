// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Card, Checkbox, Divider, Grid, Group, Modal, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { formatHumanName } from '@medplum/core';
import type { ChargeItem, Condition, Coverage, Encounter, Patient, Practitioner } from '@medplum/fhirtypes';
import { IconArrowUpRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { isSelfPayCoverage, SELF_PAY_VALUE } from '../../utils/coverage';

type BillingType = 'insurance' | 'self-pay';

function getPayerName(coverage: WithId<Coverage>): string {
  return coverage.payor?.find(p) => p.display)?.display ?? 'Unknown Payer';
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

interface CoverageCardProps {
  coverage: WithId<Coverage>;
  selected: boolean;
  onToggle: () => void;
}

const CoverageCard = ({ coverage, selected, onToggle }: CoverageCardProps): JSX.Element => {
  return (
    <Card
      withBorder
      p="xs"
      style={{ borderColor: selected ? 'var(--mantine-color-blue-6)' : undefined, borderWidth: 2 }}
    >
      <Group justify="space-between" mb={6}>
        <Text size="xs" tt="uppercase" fw={600} c="dimmed">
          Coverage
        </Text>
        <Checkbox size="xs" checked={selected} onChange={onToggle} style={{ cursor: 'pointer' }} />
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
  submitting: boolean;
  insuranceCoverages: WithId<Coverage>[];
  selfPayValue: string;
  initialBillingType: BillingType;
  onClose: () => void;
  onConfirm: (coverageIds: string[]) => void;
}

const ClaimPicker = (props: ClaimPickerProps): JSX.Element => {
  const {
    patient,
    conditions,
    practitioner,
    submitting,
    insuranceCoverages,
    selfPayValue,
    initialBillingType,
    onConfirm,
  } = props;

  const [billingType, setBillingType] = useState<BillingType>(initialBillingType);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialBillingType === 'insurance' ? insuranceCoverages.map((c) => c.id) : [])
  );

  const patientName = patient.name?.[0] ? formatHumanName(patient.name[0]) : 'Unknown Patient';
  const practitionerName = practitioner?.name?.[0] ? formatHumanName(practitioner.name[0]) : '—';
  const diagnosisText = conditions.length > 0 ? conditions.map(formatDiagnosis).join(', ') : 'None';

  const toggleCoverage = (id: string): void => {
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

  const toggleCoverageAll = (): void => {
    setSelectedIds((prev) =>
      prev.size === insuranceCoverages.length ? new Set() : new Set(insuranceCoverages.map((c) => c.id))
    );
  };
  const handleConfirm = (): void => {
    if (billingType === 'self-pay') {
      onConfirm([selfPayValue]);
    } else {
      onConfirm(insuranceCoverages.filter((c) => selectedIds.has(c.id)).map((c) => c.id));
    }
  };

  const canSubmit = billingType === 'self-pay' || selectedIds.size > 0;

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
            onClick={() => setBillingType('insurance')}
            style={{ flex: 1 }}
            disabled={insuranceCoverages.length === 0}
          >
            Insurance pay
          </Button>
          <Button
            size="md"
            variant={billingType === 'self-pay' ? 'filled' : 'default'}
            onClick={() => setBillingType('self-pay')}
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
              <Text size="xs" c="blue" style={{ cursor: 'pointer' }} onClick={() => toggleCoverageAll()}>
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
                  onToggle={() => toggleCoverage(coverage.id)}
                />
              ))}
            </Stack>
          </Box>
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

      <Group justify="flex-end">
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
          submitting={submitting}
          insuranceCoverages={insuranceCoverages}
          selfPayValue={selfPayValue}
          initialBillingType={initialBillingType}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      )}
    </Modal>
  );
};
