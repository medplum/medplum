// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Table } from '@mantine/core';
import { formatCodeableConcept, formatDate } from '@medplum/core';
import { MedicationRequest } from '@medplum/fhirtypes';
import { JSX } from 'react';
import { useNavigate } from 'react-router';
import { PrescriptionActionButton } from './PrescriptionActions';

interface PrescriptionRowProps {
  prescription: MedicationRequest;
  onChange: (prescription: MedicationRequest) => void;
}

export function PrescriptionRow(props: PrescriptionRowProps): JSX.Element {
  const navigate = useNavigate();
  const date = props.prescription.authoredOn ? formatDate(props.prescription.authoredOn) : 'unknown';

  return (
    <Table.Tr onClick={() => navigate(`/MedicationRequest/${props.prescription.id}`)?.catch(console.error)}>
      <Table.Td>{formatCodeableConcept(props.prescription.medicationCodeableConcept)}</Table.Td>
      <Table.Td>{date}</Table.Td>
      <Table.Td>{props.prescription.status}</Table.Td>
      <Table.Td>
        <PrescriptionActionButton prescription={props.prescription} onChange={props.onChange} />
      </Table.Td>
    </Table.Tr>
  );
}
