// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Table } from '@mantine/core';
import { List, MedicationKnowledge } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import { JSX } from 'react';
import { useNavigate } from 'react-router';

interface FormularyDisplayProps {
  readonly formulary?: List;
}

export function FormularyDisplay(props: FormularyDisplayProps): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  if (!props.formulary) {
    return <Loading />;
  }

  const entries: MedicationKnowledge[] | undefined = props.formulary?.entry
    ?.filter((entry) => entry.item.reference?.split('/')?.[0] === 'MedicationKnowledge')
    .map((entry) => {
      return medplum.readReference(entry.item).read() as MedicationKnowledge;
    });

  function handleRowClick(_e: React.MouseEvent, resource: MedicationKnowledge): void {
    navigate(`/MedicationKnowledge/${resource.id}`)?.catch(console.error);
  }

  return (
    <Table highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Medication</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th>Synonyms</Table.Th>
        </Table.Tr>
      </Table.Thead>
      {entries ? (
        <Table.Tbody>
          {entries?.map((entry, i) => (
            <Table.Tr key={i} onClick={(e) => handleRowClick(e, entry)}>
              <Table.Td>{entry.code?.coding?.[0].display}</Table.Td>
              <Table.Td>{entry.status}</Table.Td>
              <Table.Td>{entry.synonym}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      ) : (
        <Table.Tbody />
      )}
    </Table>
  );
}
