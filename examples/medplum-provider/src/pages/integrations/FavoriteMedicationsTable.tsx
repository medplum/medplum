// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { Table, Card, Text, LoadingOverlay } from '@mantine/core';
import { MedicationKnowledge } from '@medplum/fhirtypes';
import { getCodeBySystem, NDC, RXNORM } from '@medplum/core';
import { getMedicationName } from '@medplum/dosespot-react';

interface FavoriteMedicationsTableProps {
  clinicFavoriteMedications: MedicationKnowledge[] | undefined;
  loadingFavorites?: boolean;
}

/**
 * This is a demo component for how you could display your favorite Medications
 * from DoseSpot.
 *
 * The page is refreshed when a medication is added to the favorites list.
 *
 * @param props - The props for the component.
 * @param props.clinicFavoriteMedications - The clinic favorite medications to display.
 * @param props.loadingFavorites - Whether the table is loading.
 * @returns A React component that displays the favorite medications.
 */
export function FavoriteMedicationsTable({
  clinicFavoriteMedications,
  loadingFavorites,
}: FavoriteMedicationsTableProps): React.JSX.Element {
  if (loadingFavorites) {
    return (
      <Card withBorder p="xl">
        <LoadingOverlay visible={true} />
      </Card>
    );
  }

  if (!clinicFavoriteMedications || clinicFavoriteMedications.length === 0) {
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
          <Table.Th>RxNorm</Table.Th>
          <Table.Th>Directions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {clinicFavoriteMedications.map((clinicFavoriteMedication, index) => (
          <Table.Tr key={clinicFavoriteMedication.id || index}>
            <Table.Td>
              <Text fw={500}>{getMedicationName(clinicFavoriteMedication)}</Text>
            </Table.Td>
            <Table.Td>
              {clinicFavoriteMedication.code ? getCodeBySystem(clinicFavoriteMedication.code, NDC) : ''}
            </Table.Td>
            <Table.Td>
              {clinicFavoriteMedication.code ? getCodeBySystem(clinicFavoriteMedication.code, RXNORM) : ''}
            </Table.Td>
            <Table.Td>
              {clinicFavoriteMedication.administrationGuidelines?.[0]?.dosage?.[0]?.dosage?.[0]?.patientInstruction ||
                ''}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
