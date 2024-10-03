import { Button, Table } from '@mantine/core';
import { formatCodeableConcept, formatDate } from '@medplum/core';
import { MedicationRequest } from '@medplum/fhirtypes';

interface PrescriptionRowProps {
  prescription: MedicationRequest;
}

export function PrescriptionRow({ prescription }: PrescriptionRowProps): JSX.Element {
  const date = prescription.authoredOn ? formatDate(prescription.authoredOn) : 'unknown';

  return (
    <Table.Tr key={prescription.id}>
      <Table.Td>{formatCodeableConcept(prescription.medicationCodeableConcept)}</Table.Td>
      <Table.Td>{date}</Table.Td>
      <Table.Td>{prescription.status}</Table.Td>
      {prescription.status === 'draft' && <Button>Create Order</Button>}
    </Table.Tr>
  );
}
