// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Group, Paper, Stack, Table, Text, ThemeIcon } from '@mantine/core';
import type { Patient, ServiceRequest } from '@medplum/fhirtypes';
import { IconStethoscope } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';

export interface ReferralReviewProps {
  /** The draft referral, built by buildReferral. This exact content is saved on approval. */
  readonly referral: ServiceRequest;
  /** The selected patient, for details the reference doesn't carry (DOB). */
  readonly patient: Patient;
}

function capitalize(value: string | undefined): string | undefined {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : undefined;
}

/**
 * Read-only summary of the referral for the practitioner to approve before sending.
 * Header: the doctor being referred to and their specialty. Below: the details.
 * @param props - The draft referral and patient.
 * @returns The review card.
 */
export function ReferralReview(props: ReferralReviewProps): JSX.Element {
  const { referral, patient } = props;
  const doctor = referral.performer?.[0]?.display;
  const specialty = referral.performerType?.text;

  const specialtyCode = referral.performerType?.coding?.[0]?.code;

  // Every field the app populates, with plain labels and readable values.
  const rows: [label: string, value: ReactNode][] = [
    ['Patient', `${referral.subject?.display ?? ''}${patient.birthDate ? ` (DOB ${patient.birthDate})` : ''}`],
    ['Referred by', referral.requester?.display],
    ['Request', referral.code?.text],
    ['Reason', referral.note?.[0]?.text],
    ['Specialty code', specialtyCode ? `${specialtyCode} (NUCC provider taxonomy)` : undefined],
    ['Status', capitalize(referral.status)],
    ['Type', capitalize(referral.intent)],
    ['Date', referral.authoredOn ? new Date(referral.authoredOn).toLocaleString() : undefined],
    ['Referral ID', referral.identifier?.[0]?.value],
  ];

  return (
    <Paper withBorder p="md" radius="md">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon size={40} radius="xl" variant="light">
          <IconStethoscope size={22} />
        </ThemeIcon>
        <Stack gap={0}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Referring to
          </Text>
          <Text fw={700} size="xl" lh={1.2}>
            {doctor || 'Unknown practitioner'}
          </Text>
          {specialty && <Text c="blue.7">{specialty}</Text>}
        </Stack>
      </Group>

      <Divider my="sm" />

      <Table withRowBorders={false} verticalSpacing={4}>
        <Table.Tbody>
          {rows.map(([label, value]) => (
            <Table.Tr key={label}>
              <Table.Td w="35%" valign="top">
                <Text size="sm" c="dimmed">
                  {label}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  {value || (
                    <Text span c="dimmed">
                      —
                    </Text>
                  )}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
