// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Divider, Group, Paper, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import {
  formatCodeableConcept,
  formatDate,
  formatHumanName,
  getEPrescribingIframeUrl,
  getEPrescribingPendingOrderId,
  getEPrescribingPendingOrderStatus,
} from '@medplum/core';
import type { EPrescribingExtensions } from '@medplum/core';
import type {
  Dosage,
  HumanName,
  MedicationRequest,
  Patient,
  Practitioner,
  Quantity,
} from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { IconExternalLink, IconMaximize } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { getQuantityQualifierLabel } from './quantity-qualifiers';

interface MedicationRequestDetailsProps {
  medicationRequest: MedicationRequest;
  ePrescribingExtensions: EPrescribingExtensions;
  onOpenInScriptSure: () => void;
}

/**
 * Format dispense quantity: numeric value plus NCI potency-unit label (not UCUM).
 * @param quantity - FHIR Quantity on dispenseRequest.
 * @returns Human-readable quantity string.
 */
function formatQuantityWithQualifier(quantity: Quantity | undefined): string {
  if (!quantity) {
    return '—';
  }
  const parts: string[] = [];
  if (quantity.comparator) {
    parts.push(quantity.comparator);
  }
  if (quantity.value !== undefined) {
    parts.push(String(quantity.value));
  }
  const rawUnit = quantity.unit?.trim();
  const code = quantity.code?.trim();
  const qualifierKey = rawUnit || code || '';
  const nciLabel = qualifierKey ? getQuantityQualifierLabel(qualifierKey) : undefined;
  const human =
    nciLabel ||
    rawUnit ||
    (code && quantity.system ? `${quantity.system}|${code}` : code) ||
    '';
  if (human) {
    parts.push(human);
  }
  return parts.join(' ').trim() || '—';
}

function formatDosageLine(dosage: Dosage, index: number): JSX.Element {
  const label = `Dose / sig ${index + 1}`;
  const bits: string[] = [];
  if (dosage.text) {
    bits.push(dosage.text);
  }
  if (dosage.patientInstruction) {
    bits.push(`Patient: ${dosage.patientInstruction}`);
  }
  if (dosage.timing?.repeat) {
    const r = dosage.timing.repeat;
    let timingSummary: string | undefined;
    if (r.frequency !== undefined && r.period !== undefined) {
      timingSummary = `${r.frequency} per ${r.period} ${r.periodUnit ?? ''}`.trim();
    } else if (r.boundsDuration?.value !== undefined) {
      timingSummary = `${r.boundsDuration.value} ${r.boundsDuration.unit ?? ''}`.trim();
    } else if (r.boundsRange?.low?.value !== undefined || r.boundsRange?.high?.value !== undefined) {
      timingSummary = `${r.boundsRange?.low?.value ?? '?'}–${r.boundsRange?.high?.value ?? '?'}`;
    }
    if (timingSummary) {
      bits.push(`Timing: ${timingSummary}`);
    }
  }
  if (dosage.timing?.code?.text) {
    bits.push(`Schedule: ${dosage.timing.code.text}`);
  }
  if (dosage.route) {
    bits.push(`Route: ${formatCodeableConcept(dosage.route)}`);
  }
  const doseQty = dosage.doseAndRate?.[0]?.doseQuantity;
  if (doseQty) {
    bits.push(`Amount: ${formatQuantityWithQualifier(doseQty)}`);
  }
  const body = bits.length > 0 ? bits.join(' · ') : '—';
  return (
    <Group key={index} align="flex-start" gap="lg" wrap="nowrap">
      <Text fw={500} size="sm" style={{ width: '150px', flexShrink: 0 }} c="dimmed">
        {label}
      </Text>
      <Text size="sm" style={{ flex: 1 }}>
        {body}
      </Text>
    </Group>
  );
}

function DetailRow(props: { label: string; children: ReactNode }): JSX.Element {
  const { label, children } = props;
  return (
    <Group align="flex-start" gap="lg" wrap="nowrap">
      <Text fw={500} size="sm" style={{ width: '150px', flexShrink: 0 }} c="dimmed">
        {label}
      </Text>
      <Stack gap={4} style={{ flex: 1 }}>
        {children}
      </Stack>
    </Group>
  );
}

export function MedicationRequestDetails(props: MedicationRequestDetailsProps): JSX.Element {
  const { medicationRequest, ePrescribingExtensions, onOpenInScriptSure } = props;
  const navigate = useNavigate();
  const requesterRes = useResource(medicationRequest.requester) as Practitioner | undefined;
  const patientRes = useResource(medicationRequest.subject) as Patient | undefined;

  const pendingId = getEPrescribingPendingOrderId(medicationRequest, ePrescribingExtensions);
  const pendingStatus = getEPrescribingPendingOrderStatus(medicationRequest, ePrescribingExtensions);
  const storedIframeUrl = getEPrescribingIframeUrl(medicationRequest, ePrescribingExtensions);

  const medText =
    medicationRequest.medicationCodeableConcept?.text ||
    formatCodeableConcept(medicationRequest.medicationCodeableConcept) ||
    '—';

  const requesterName =
    medicationRequest.requester?.display ||
    (requesterRes?.resourceType === 'Practitioner' ? formatHumanName(requesterRes.name?.[0] as HumanName) : undefined);

  const dispQty = medicationRequest.dispenseRequest?.quantity;
  const rawQualifier = dispQty?.unit?.trim() || dispQty?.code?.trim();
  const qualifierHint = getQuantityQualifierTooltip(rawQualifier);

  const openFullRecord = (): void => {
    if (medicationRequest.id) {
      navigate(`/MedicationRequest/${medicationRequest.id}`)?.catch(console.error);
    }
  };

  return (
    <ScrollArea h="100%" type="scroll">
      <Paper p="md" h="100%">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Stack gap={4}>
              <Text size="xl" fw={800}>
                {medText}
              </Text>
              <Text size="sm" c="dimmed">
                {medicationRequest.id && (
                  <>
                    MedicationRequest/{medicationRequest.id}
                    {' · '}
                  </>
                )}
                Last updated {formatDate(medicationRequest.meta?.lastUpdated)}
              </Text>
            </Stack>
            <Group gap="xs">
              <Button
                variant="default"
                leftSection={<IconMaximize size={16} />}
                onClick={openFullRecord}
                disabled={!medicationRequest.id}
              >
                View full record
              </Button>
              {(pendingId || storedIframeUrl) && (
                <Button leftSection={<IconExternalLink size={16} />} onClick={onOpenInScriptSure}>
                  Open in ScriptSure
                </Button>
              )}
            </Group>
          </Group>

          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              Ordered {formatDate(medicationRequest.authoredOn || medicationRequest.meta?.lastUpdated)}
            </Text>
            <Badge size="lg" color={medicationStatusColor(medicationRequest.status)} variant="light">
              {medicationRequest.status ?? 'unknown'}
            </Badge>
          </Group>

          <Text size="sm" c="dimmed">
            Intent: {medicationRequest.intent ?? '—'}
            {medicationRequest.priority ? ` · Priority: ${medicationRequest.priority}` : ''}
            {medicationRequest.reportedBoolean !== undefined
              ? ` · Reported (secondary record): ${medicationRequest.reportedBoolean ? 'yes' : 'no'}`
              : ''}
          </Text>

          {(pendingStatus || pendingId) && (
            <Text size="sm">
              <Text span fw={600}>
                e-Prescribing:
              </Text>{' '}
              {pendingStatus && `pending status ${pendingStatus}`}
              {pendingStatus && pendingId ? ' · ' : ''}
              {pendingId && `order #${pendingId}`}
            </Text>
          )}

          <Divider />

          <Stack gap="sm">
            {medicationRequest.medicationCodeableConcept?.coding &&
              medicationRequest.medicationCodeableConcept.coding.length > 0 && (
                <DetailRow label="Medication codes">
                  {medicationRequest.medicationCodeableConcept.coding.map((c, i) => (
                    <Text key={i} size="sm">
                      {c.display ? `${c.display} · ` : ''}
                      {c.system} | {c.code}
                    </Text>
                  ))}
                </DetailRow>
              )}

            {medicationRequest.category && medicationRequest.category.length > 0 && (
              <DetailRow label="Category">
                {medicationRequest.category.map((c, i) => (
                  <Text key={i} size="sm">
                    {formatCodeableConcept(c)}
                  </Text>
                ))}
              </DetailRow>
            )}

            {patientRes?.resourceType === 'Patient' && (
              <DetailRow label="Patient">
                <Text size="sm">{formatHumanName(patientRes.name?.[0] as HumanName)}</Text>
              </DetailRow>
            )}

            {requesterName && (
              <DetailRow label="Requester">
                <Text size="sm">{requesterName}</Text>
              </DetailRow>
            )}

            {medicationRequest.reasonCode && medicationRequest.reasonCode.length > 0 && (
              <DetailRow label="Reason">
                {medicationRequest.reasonCode.map((r, i) => (
                  <Text key={i} size="sm">
                    {r.text || formatCodeableConcept(r)}
                  </Text>
                ))}
              </DetailRow>
            )}

            {medicationRequest.dosageInstruction?.map((d, i) => formatDosageLine(d, i))}

            <DetailRow label="Dispense">
              <>
                {dispQty && (
                  <Group gap="xs" align="center" wrap="wrap">
                    <Text size="sm">
                      <Text span fw={600}>
                        Quantity:{' '}
                      </Text>
                      {formatQuantityWithQualifier(dispQty)}
                    </Text>
                    {qualifierHint && (
                      <Tooltip label={qualifierHint} multiline w={280} withArrow>
                        <Text size="xs" c="dimmed" style={{ cursor: 'help', textDecoration: 'underline dotted' }}>
                          What is this code?
                        </Text>
                      </Tooltip>
                    )}
                  </Group>
                )}
                {medicationRequest.dispenseRequest?.validityPeriod && (
                  <Text size="sm">
                    Validity:{' '}
                    {medicationRequest.dispenseRequest.validityPeriod.start
                      ? formatDate(medicationRequest.dispenseRequest.validityPeriod.start)
                      : '?'}
                    {' – '}
                    {medicationRequest.dispenseRequest.validityPeriod.end
                      ? formatDate(medicationRequest.dispenseRequest.validityPeriod.end)
                      : '?'}
                  </Text>
                )}
                {medicationRequest.dispenseRequest?.expectedSupplyDuration?.value !== undefined && (
                  <Text size="sm">
                    <Text span fw={600}>
                      Days supply:{' '}
                    </Text>
                    {medicationRequest.dispenseRequest.expectedSupplyDuration.value}{' '}
                    {medicationRequest.dispenseRequest.expectedSupplyDuration.unit === 'days' ||
                    medicationRequest.dispenseRequest.expectedSupplyDuration.code === 'd'
                      ? 'days'
                      : (medicationRequest.dispenseRequest.expectedSupplyDuration.unit ??
                          medicationRequest.dispenseRequest.expectedSupplyDuration.code ??
                          '')}
                  </Text>
                )}
                {medicationRequest.dispenseRequest?.numberOfRepeatsAllowed !== undefined && (
                  <Text size="sm">
                    Refills allowed: {medicationRequest.dispenseRequest.numberOfRepeatsAllowed}
                  </Text>
                )}
                {medicationRequest.dispenseRequest?.performer && (
                  <Text size="sm">
                    Intended dispenser:{' '}
                    {medicationRequest.dispenseRequest.performer.display ||
                      medicationRequest.dispenseRequest.performer.reference}
                  </Text>
                )}
                {!dispQty &&
                  medicationRequest.dispenseRequest?.numberOfRepeatsAllowed === undefined &&
                  !medicationRequest.dispenseRequest?.validityPeriod && (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )}
              </>
            </DetailRow>

            {medicationRequest.substitution && (
              <DetailRow label="Substitution">
                <Text size="sm">
                  {formatSubstitutionAllowed(medicationRequest.substitution.allowedBoolean)}
                  {medicationRequest.substitution.reason && (
                    <> · {formatCodeableConcept(medicationRequest.substitution.reason)}</>
                  )}
                </Text>
              </DetailRow>
            )}

            {medicationRequest.note && medicationRequest.note.length > 0 && (
              <DetailRow label="Notes">
                {medicationRequest.note.map((n, i) => (
                  <Text key={i} size="sm">
                    {n.text}
                  </Text>
                ))}
              </DetailRow>
            )}

            {medicationRequest.identifier && medicationRequest.identifier.length > 0 && (
              <DetailRow label="Identifiers">
                {medicationRequest.identifier.map((id, i) => (
                  <Text key={i} size="sm">
                    {id.system}|{id.value}
                  </Text>
                ))}
              </DetailRow>
            )}
          </Stack>
        </Stack>
      </Paper>
    </ScrollArea>
  );
}

function getQuantityQualifierTooltip(rawQualifier: string | undefined): string | undefined {
  if (!rawQualifier) {
    return undefined;
  }
  const labeled = getQuantityQualifierLabel(rawQualifier);
  if (labeled) {
    return `Code ${rawQualifier} is a DAW/NCI “quantity qualifier” (${labeled}), not a UCUM unit like “mg” or “mL”. It describes how to count the dispensed amount (e.g. tablets).`;
  }
  if (/^C\d+$/i.test(rawQualifier)) {
    return `Unlabeled code “${rawQualifier}” is a quantity-qualifier / NCI potency-unit code stored on the dispense quantity, not a UCUM unit.`;
  }
  return undefined;
}

function formatSubstitutionAllowed(allowed: boolean | undefined): string {
  if (allowed === true) {
    return 'Allowed';
  }
  if (allowed === false) {
    return 'Not allowed';
  }
  return '—';
}

function medicationStatusColor(status: string | undefined): string {
  switch (status) {
    case 'active':
      return 'blue';
    case 'draft':
      return 'yellow';
    case 'on-hold':
      return 'orange';
    case 'cancelled':
    case 'entered-in-error':
      return 'red';
    case 'completed':
    case 'stopped':
      return 'green';
    case 'unknown':
      return 'gray';
    default:
      return 'gray';
  }
}
