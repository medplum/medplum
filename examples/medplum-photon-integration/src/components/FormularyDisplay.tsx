import { Table, TableThead } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { List, MedicationKnowledge } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import { useNavigate } from 'react-router-dom';

interface FormularyDisplayProps {
  readonly formulary?: List;
}

export function FormularyDisplay(props: FormularyDisplayProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  if (!props.formulary) {
    return <Loading />;
  }

  const entries: MedicationKnowledge[] | undefined = props.formulary?.entry
    ?.filter((entry) => entry.item.reference?.split('/')?.[0] === 'MedicationKnowledge')
    .map((entry) => {
      return medplum.readReference(entry.item).read() as MedicationKnowledge;
    });

  function handleRowClick(e: React.MouseEvent, resource: MedicationKnowledge) {}

  return (
    <Table>
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
