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
        <thead>
          <tr>
            <th>Measurement</th>
            <th>Your Value</th>
            <th>Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {observations.map((obs) => (
            <tr key={obs.id}>
              <td>{obs.code?.coding?.[0]?.display}</td>
              <td>{formatObservationValue(obs)}</td>
              <td>{formatDate(obs.meta?.lastUpdated)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Document>
  );
}
