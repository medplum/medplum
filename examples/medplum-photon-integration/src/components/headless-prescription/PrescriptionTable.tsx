// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Table } from '@mantine/core';
import { MedicationRequest } from '@medplum/fhirtypes';
import { JSX } from 'react';
import { PrescriptionRow } from './PrescriptionRow';

interface PrescriptionTableProps {
  prescriptions: MedicationRequest[];
  onChange: (prescription: MedicationRequest) => void;
}

export function PrescriptionTable(props: PrescriptionTableProps): JSX.Element {
  return (
    <Table highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Td>Medication</Table.Td>
          <Table.Td>Written Date</Table.Td>
          <Table.Td>Status</Table.Td>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {props.prescriptions.map((prescription) => (
          <PrescriptionRow prescription={prescription} onChange={props.onChange} key={prescription.id} />
        ))}
      </Table.Tbody>
    </Table>
  );
}
