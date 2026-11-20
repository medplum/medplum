// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { formatAddress } from '@medplum/core';
import type { Practitioner, PractitionerRole } from '@medplum/fhirtypes';
import { IconMapPin, IconPhone } from '@tabler/icons-react';
import type { JSX } from 'react';
import { formatDisplayName } from '../practitioners';

export interface PractitionerCardProps {
  readonly practitioner: Practitioner;
  readonly role: PractitionerRole;
  /** Called when the user clicks "Refer". */
  readonly onRefer?: () => void;
}

/**
 * Shows one practitioner as a card: name, specialty, address, and phone.
 * Everything is read from the FHIR Practitioner and PractitionerRole, not from the NPPES JSON.
 * Lines with no data are left out.
 * @param props - The FHIR Practitioner and PractitionerRole to show.
 * @returns The card.
 */
export function PractitionerCard(props: PractitionerCardProps): JSX.Element {
  const { practitioner, role } = props;
  const name = formatDisplayName(practitioner.name?.[0]);
  // The converter puts the primary specialty first.
  const [primarySpecialty, ...otherSpecialties] = role.specialty ?? [];
  const address = formatAddress(practitioner.address?.[0]);
  const phone = practitioner.telecom?.find((t) => t.system === 'phone')?.value;

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap={6}>
        <Text fw={600} size="lg">
          {name || 'Name not listed'}
        </Text>

        {primarySpecialty && <Text c="blue.7">{primarySpecialty.text}</Text>}
        {otherSpecialties.length > 0 && (
          <Group gap={4}>
            {otherSpecialties.map((s) => (
              <Badge key={s.coding?.[0]?.code ?? s.text} variant="light" color="gray" tt="none">
                {s.text}
              </Badge>
            ))}
          </Group>
        )}

        {address && (
          <Group gap={6} wrap="nowrap" align="flex-start">
            <IconMapPin size={16} style={{ flexShrink: 0, marginTop: 3 }} />
            <Text size="sm">{address}</Text>
          </Group>
        )}
        {phone && (
          <Group gap={6} wrap="nowrap">
            <IconPhone size={16} style={{ flexShrink: 0 }} />
            <Text size="sm">{phone}</Text>
          </Group>
        )}

        {props.onRefer && (
          <Group justify="flex-end">
            <Button size="xs" onClick={props.onRefer}>
              Select
            </Button>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
