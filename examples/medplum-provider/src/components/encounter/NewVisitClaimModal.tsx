// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Checkbox, Group, Select, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { CPT, formatMoney } from '@medplum/core';
import type { ChargeItem, Condition, Coverage } from '@medplum/fhirtypes';
import { Modal } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { getConditionCode } from '../billing/claimConditions';
import classes from './NewVisitClaimModal.module.css';

export interface NewVisitClaimModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  /** The visit's charge items, in line order. */
  readonly chargeItems: WithId<ChargeItem>[];
  /** The visit's diagnoses, in order. */
  readonly conditions: Condition[];
  readonly coverages: WithId<Coverage>[];
  /** The coverage selected by default: the visit's primary insurance. */
  readonly defaultCoverage?: WithId<Coverage>;
  /** Why a charge item can't go on a new claim, e.g. it's on a submitted one, by charge item id. */
  readonly unavailable: ReadonlyMap<string, string>;
  /** The open claim a charge item would move from, by charge item id, e.g. "Moves from Claim · 11/18/2026". */
  readonly moving?: ReadonlyMap<string, string>;
  /** The charge items picked when the dialog opens. */
  readonly preselected?: readonly string[];
  /** Creates the claim from the picked charge items, billed to the coverage. */
  readonly onCreate: (chargeItems: WithId<ChargeItem>[], coverage: WithId<Coverage> | undefined) => Promise<void>;
}

/**
 * Creates a claim for some of the visit's service lines. Pick the lines and the insurance to bill; the claim takes the
 * diagnoses those lines point to, and the visit's providers, facility and place of service.
 * @param props - The NewVisitClaimModal React props.
 * @returns The modal.
 */
export function NewVisitClaimModal(props: NewVisitClaimModalProps): JSX.Element {
  const { opened, onClose, conditions, coverages, defaultCoverage, unavailable, moving, preselected, onCreate } = props;
  const lines = props.chargeItems.filter((c) => c.code?.coding?.some((coding) => coding.system === CPT));
  const [selected, setSelected] = useState<string[]>([]);
  const [coverageId, setCoverageId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (opened) {
      setSelected([...(preselected ?? [])]);
      setCoverageId(defaultCoverage?.id ?? null);
    }
    // Reset each time it opens, with the picks it opens with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, defaultCoverage]);

  const picked = lines.filter((c) => selected.includes(c.id));
  const diagnoses = getPointedConditions(picked, conditions);
  const total = picked.reduce((sum, c) => sum + (c.priceOverride?.value ?? 0), 0);

  const create = async (): Promise<void> => {
    setSaving(true);
    try {
      await onCreate(
        picked,
        coverages.find((c) => c.id === coverageId)
      );
      onClose();
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="New Claim"
      actions={
        <Button disabled={!picked.length} loading={saving} onClick={create}>
          {picked.length ? `Create Claim · ${formatMoney({ value: total, currency: 'USD' })}` : 'Create Claim'}
        </Button>
      }
    >
      <Stack gap="lg">
        <Checkbox.Group
          label="Charge Items"
          description="The visit's charge items to bill on this claim"
          withAsterisk
          value={selected}
          onChange={setSelected}
        >
          <Stack gap="xs" mt="xs">
            {lines.length === 0 && (
              <Text size="sm" c="dimmed">
                This visit has no charge items to bill.
              </Text>
            )}
            {lines.map((chargeItem, index) => (
              <LineOption
                key={chargeItem.id}
                chargeItem={chargeItem}
                sequence={index + 1}
                conditions={conditions}
                disabledNote={unavailable.get(chargeItem.id)}
                note={moving?.get(chargeItem.id)}
              />
            ))}
          </Stack>
        </Checkbox.Group>

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Diagnoses
          </Text>
          <Text size="xs" c="dimmed">
            The diagnoses the selected lines point to, in the visit&apos;s order
          </Text>
          {diagnoses.length ? (
            <Group gap={6} mt={4}>
              {diagnoses.map((condition, index) => (
                <Badge key={getConditionCode(condition) ?? index} variant="light" color="gray" radius="sm" tt="none">
                  {String.fromCodePoint(65 + index)} · {getConditionCode(condition)}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed" mt={4}>
              {picked.length ? 'None. Add diagnoses to the visit first.' : 'Select service lines first.'}
            </Text>
          )}
        </Stack>

        <Select
          label="Insurance"
          description="The coverage to bill"
          placeholder="Select coverage"
          data={coverages.map((c) => ({ value: c.id, label: getCoverageLabel(c) }))}
          value={coverageId}
          onChange={setCoverageId}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
        />

        <Text size="xs" c="dimmed">
          The claim uses the visit&apos;s practitioner, billing organization, facility and place of service. Charge
          items on another open claim move to this one, so they aren&apos;t billed twice.
        </Text>
      </Stack>
    </Modal>
  );
}

function LineOption(props: {
  readonly chargeItem: WithId<ChargeItem>;
  readonly sequence: number;
  readonly conditions: Condition[];
  /** Why the line can't be picked. */
  readonly disabledNote?: string;
  readonly note?: string;
}): JSX.Element {
  const { chargeItem, sequence, conditions, disabledNote, note } = props;
  const coding = chargeItem.code?.coding?.find((c) => c.system === CPT);
  const units = chargeItem.quantity?.value ?? 1;
  const pointers = (chargeItem.reason ?? [])
    .map((r) => conditions.findIndex((c) => getConditionCode(c) === r.coding?.[0]?.code))
    .filter((i) => i >= 0)
    .map((i) => String.fromCodePoint(65 + i));
  return (
    <Checkbox.Card value={chargeItem.id} disabled={!!disabledNote} radius="md" className={classes.card}>
      <Group wrap="nowrap" align="flex-start" gap="sm">
        <Checkbox.Indicator disabled={!!disabledNote} mt={2} />
        <Stack gap={2} miw={0} style={{ flex: 1 }}>
          <Group gap={6} wrap="nowrap">
            <Text size="sm" c="dimmed" w="1.25rem" style={{ flex: 'none' }}>
              {sequence}
            </Text>
            <Text size="sm" fw={600} style={{ flex: 'none' }}>
              {coding?.code}
            </Text>
            <Text size="sm" truncate>
              {coding?.display ?? chargeItem.code?.text}
            </Text>
          </Group>
          <Text size="xs" c="dimmed" pl="calc(1.25rem + 6px)">
            {[
              `${units} ${units === 1 ? 'unit' : 'units'}`,
              pointers.length ? `Dx ${pointers.join(', ')}` : 'No diagnosis pointers',
              disabledNote ?? note,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Stack>
        <Text size="sm" fw={500} style={{ flex: 'none' }}>
          {chargeItem.priceOverride ? formatMoney(chargeItem.priceOverride) : '—'}
        </Text>
      </Group>
    </Checkbox.Card>
  );
}

/**
 * The diagnoses some charge items point to, in the visit's order.
 * @param chargeItems - The charge items.
 * @param conditions - The visit's diagnoses.
 * @returns The diagnoses they point to.
 */
export function getPointedConditions(chargeItems: ChargeItem[], conditions: Condition[]): Condition[] {
  const codes = new Set(chargeItems.flatMap((c) => (c.reason ?? []).map((r) => r.coding?.[0]?.code)));
  return conditions.filter((c) => codes.has(getConditionCode(c)));
}

function getCoverageLabel(coverage: Coverage): string {
  const payor = coverage.payor?.[0]?.display;
  const plan = coverage.class?.find((c) => c.type?.coding?.[0]?.code === 'plan')?.name;
  return [payor ?? coverage.type?.text ?? coverage.type?.coding?.[0]?.display ?? 'Coverage', plan]
    .filter(Boolean)
    .join(' · ');
}
