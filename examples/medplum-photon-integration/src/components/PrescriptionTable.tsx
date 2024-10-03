import { Table } from '@mantine/core';
import { formatCodeableConcept, formatDate } from '@medplum/core';
import { MedicationRequest } from '@medplum/fhirtypes';
import { PrescriptionRow } from './PrescriptionRow';

interface PrescriptionTableProps {
  prescriptions: MedicationRequest[];
}

export function PrescriptionTable({ prescriptions }: PrescriptionTableProps): JSX.Element {
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
        {prescriptions.map((prescription) => (
          <PrescriptionRow prescription={prescription} />
        ))}
      </Table.Tbody>
    </Table>
  );
}
