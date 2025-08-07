// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect } from 'react';
import { Table, Card, Text, LoadingOverlay } from '@mantine/core';
import { MedicationKnowledge } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { formatSearchQuery, getCodeBySystem, NDC } from '@medplum/core';

interface FavoriteMedicationsTableProps {
  refreshKey?: number;
}

/**
 * This is a demo component for how you could display your favorite Medications
 * from DoseSpot.
 *
 * The page is refreshed when a medication is added to the favorites list.
 *
 * @param props - The props for the component.
 * @param props.refreshKey - The key to refresh the table.
 * @returns A React component that displays the favorite medications.
 */
export function FavoriteMedicationsTable({ refreshKey }: FavoriteMedicationsTableProps): React.JSX.Element {
  const [medications, setMedications] = useState<MedicationKnowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const medplum = useMedplum();

  useEffect(() => {
    const loadMedications = async (): Promise<void> => {
      try {
        setLoading(true);

        // Get MedicationKnowledge;s that have any dosespot fav medication id system
        const searchRequest = {
          resourceType: 'MedicationKnowledge' as const,
          filters: [
            {
              code: 'code',
              operator: 'eq' as const,
              value: 'https://dosespot.com/clinic-favorite-medication-id|',
            },
          ],
        };
        const queryString = formatSearchQuery(searchRequest);
        const result = await medplum.search('MedicationKnowledge', queryString);
        setMedications(result.entry?.map((entry) => entry.resource as MedicationKnowledge) || []);
      } finally {
        setLoading(false);
      }
    };

    loadMedications().catch(console.error);
  }, [medplum, refreshKey]);

  if (loading) {
    return (
      <Card withBorder p="md">
        <LoadingOverlay visible={true} />
      </Card>
    );
  }

  if (medications.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No favorite medications found
      </Text>
    );
  }

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Medication</Table.Th>
          <Table.Th>NDC</Table.Th>
          <Table.Th>Directions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {medications.map((medication, index) => (
          <Table.Tr key={medication.id || index}>
            <Table.Td>
              <Text fw={500}>{medication.code?.text || 'Unknown'}</Text>
            </Table.Td>
            <Table.Td>{medication.code ? getCodeBySystem(medication.code, NDC) : ''}</Table.Td>
            <Table.Td>
              {medication.administrationGuidelines?.[0]?.dosage?.[0]?.dosage?.[0]?.patientInstruction || ''}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
