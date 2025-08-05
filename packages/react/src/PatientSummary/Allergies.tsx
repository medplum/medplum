// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Group, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import { AllergyIntolerance, Encounter, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { JSX, useCallback, useMemo, useState } from 'react';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { AllergyDialog } from './AllergyDialog';
import { CollapsibleSection } from './CollapsibleSection';
import SummaryItem from './SummaryItem';
import styles from './SummaryItem.module.css';

export interface AllergiesProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly allergies: AllergyIntolerance[];
  readonly onClickResource?: (resource: AllergyIntolerance) => void;
}

export function Allergies(props: AllergiesProps): JSX.Element {
  const medplum = useMedplum();
  const { patient, encounter } = props;
  const [allergies, setAllergies] = useState<AllergyIntolerance[]>(props.allergies);
  const [opened, { open, close }] = useDisclosure(false);
  const [editAllergy, setEditAllergy] = useState<AllergyIntolerance>();

  // Sort allergies with active ones first
  const sortedAllergies = useMemo(() => {
    return [...allergies].sort((a, b) => {
      const aStatus = a.clinicalStatus?.coding?.[0]?.code;
      const bStatus = b.clinicalStatus?.coding?.[0]?.code;

      // Active allergies first
      if (aStatus === 'active' && bStatus !== 'active') {
        return -1;
      }
      if (aStatus !== 'active' && bStatus === 'active') {
        return 1;
      }

      return getDisplayString(a).localeCompare(getDisplayString(b));
    });
  }, [allergies]);

  const handleSubmit = useCallback(
    async (allergy: AllergyIntolerance) => {
      if (allergy.id) {
        const updatedAllergy = await medplum.updateResource(allergy);
        setAllergies(allergies.map((a) => (a.id === updatedAllergy.id ? updatedAllergy : a)));
      } else {
        const newAllergy = await medplum.createResource(allergy);
        setAllergies([...allergies, newAllergy]);
      }
      setEditAllergy(undefined);
      close();
    },
    [medplum, allergies, close]
  );

  return (
    <>
      <CollapsibleSection
        title="Allergies"
        onAdd={() => {
          setEditAllergy(undefined);
          open();
        }}
      >
        {sortedAllergies.length > 0 ? (
          <Box>
            <Flex direction="column" gap={8}>
              {sortedAllergies.map((allergy) => {
                const status = allergy.clinicalStatus?.coding?.[0]?.code || 'unknown';

                return (
                  <SummaryItem
                    key={allergy.id}
                    onClick={() => {
                      setEditAllergy(allergy);
                      open();
                    }}
                  >
                    <Box>
                      <Text fw={500} className={styles.itemText}>
                        {getDisplayString(allergy)}
                      </Text>
                      <Group mt={2} gap={4}>
                        {status && (
                          <StatusBadge color={getClinicalStatusColor(status)} variant="light" status={status} />
                        )}
                      </Group>
                    </Box>
                  </SummaryItem>
                );
              })}
            </Flex>
          </Box>
        ) : (
          <Text>(none)</Text>
        )}
      </CollapsibleSection>
      <Modal opened={opened} onClose={close} title={editAllergy ? 'Edit Allergy' : 'Add Allergy'}>
        <AllergyDialog patient={patient} encounter={encounter} allergy={editAllergy} onSubmit={handleSubmit} />
      </Modal>
    </>
  );
}

function getClinicalStatusColor(status?: string): string {
  if (!status) {
    return 'gray';
  }

  switch (status) {
    case 'active':
      return 'red';
    case 'inactive':
      return 'orange';
    case 'resolved':
      return 'blue';
    default:
      return 'gray';
  }
}
