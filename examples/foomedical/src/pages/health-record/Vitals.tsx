import { Table, Title } from '@mantine/core';
import { formatDate, formatObservationValue, getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';

export function Vitals(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const observations = medplum.searchResources('Observation', 'patient=' + getReferenceString(patient)).read();

  return (
    <Document>
      <Title>Vitals</Title>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Measurement</Table.Th>
            <Table.Th>Your Value</Table.Th>
            <Table.Th>Last Updated</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {observations.map((obs) => (
            <Table.Tr key={obs.id}>
              <Table.Td>{obs.code?.coding?.[0]?.display}</Table.Td>
              <Table.Td>{formatObservationValue(obs)}</Table.Td>
              <Table.Td>{formatDate(obs.meta?.lastUpdated)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Document>
  );
}
