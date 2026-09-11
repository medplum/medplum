// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatCodeableConcept, formatDate } from '@medplum/core';
import type { Encounter, Immunization, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { CollapsibleSection } from './CollapsibleSection';
import { ImmunizationDialog } from './ImmunizationDialog';
import { isEnteredInError } from './PatientSummary.utils';
import SummaryItem from './SummaryItem';
import styles from './SummaryItem.module.css';

export interface ImmunizationsProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly immunizations: Immunization[];
}

export function Immunizations(props: ImmunizationsProps): JSX.Element {
  const medplum = useMedplum();
  const { patient, encounter } = props;
  const [immunizations, setImmunizations] = useState(props.immunizations);
  const [opened, { open, close }] = useDisclosure(false);
  const [editImmunization, setEditImmunization] = useState<Immunization>();

  // Hide entered-in-error immunizations (still reachable by direct URL); most recent first.
  const sortedImmunizations = [...immunizations]
    .filter((immunization) => !isEnteredInError(immunization))
    .sort((a, b) => (b.occurrenceDateTime ?? '').localeCompare(a.occurrenceDateTime ?? ''));

  const handleSubmit = useCallback(
    async (immunization: Immunization) => {
      if (immunization.id) {
        const updated = await medplum.updateResource(immunization);
        setImmunizations(immunizations.map((i) => (i.id === updated.id ? updated : i)));
      } else {
        const created = await medplum.createResource(immunization);
        setImmunizations([created, ...immunizations]);
      }
      setEditImmunization(undefined);
      close();
    },
    [medplum, immunizations, close]
  );

  const handleDelete = useCallback(async () => {
    if (!editImmunization?.id) {
      return;
    }
    await medplum.deleteResource('Immunization', editImmunization.id);
    setImmunizations(immunizations.filter((i) => i.id !== editImmunization.id));
    setEditImmunization(undefined);
    close();
  }, [medplum, immunizations, editImmunization, close]);

  return (
    <>
      <CollapsibleSection
        title="Immunizations"
        onAdd={() => {
          setEditImmunization(undefined);
          open();
        }}
      >
        {sortedImmunizations.length > 0 ? (
          <Flex direction="column" gap={8}>
            {sortedImmunizations.map((immunization) => (
              <SummaryItem
                key={immunization.id}
                onClick={() => {
                  setEditImmunization(immunization);
                  open();
                }}
              >
                <Box>
                  <Text fw={500} className={styles.itemText}>
                    {getImmunizationDisplay(immunization)}
                  </Text>
                  <Group mt={2} gap={4}>
                    {immunization.status && (
                      <StatusBadge
                        color={getImmunizationStatusColor(immunization.status)}
                        variant="light"
                        status={immunization.status}
                      />
                    )}
                    {immunization.occurrenceDateTime && (
                      <Text size="xs" fw={500} c="dimmed">
                        Given {formatDate(immunization.occurrenceDateTime)}
                      </Text>
                    )}
                  </Group>
                </Box>
              </SummaryItem>
            ))}
          </Flex>
        ) : (
          <Text>(none)</Text>
        )}
      </CollapsibleSection>
      {/* Mounted only while open so every open is a fresh instance, with no leftover form state. */}
      {opened && (
        <ImmunizationDialog
          patient={patient}
          encounter={encounter}
          immunization={editImmunization}
          opened={opened}
          onClose={close}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}

function getImmunizationDisplay(immunization: Immunization): string {
  return (immunization.vaccineCode && formatCodeableConcept(immunization.vaccineCode)) || 'Immunization';
}

function getImmunizationStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'green';
    case 'not-done':
      return 'gray';
    case 'entered-in-error':
      return 'red';
    default:
      return 'gray';
  }
}
