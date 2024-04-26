import { Grid, Paper, Title } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { Encounter, Patient, Reference } from '@medplum/fhirtypes';
import { Document, Loading, PatientSummary, useResource } from '@medplum/react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { EncounterActions } from '../components/EncounterActions';
import { EncounterDetails } from '../components/EncounterDetails';
import { EncounterHeader } from '../components/EncounterHeader';

export function EncounterPage(): JSX.Element {
  const { id } = useParams();
  const [encounter, setEncounter] = useState<Encounter>(
    useResource<Encounter>({ reference: `Encounter/${id}` }) as Encounter
  );

  const patientReference = encounter?.subject as Reference<Patient>;
  const patient = useResource<Patient>(patientReference);

  function handleEncounterChange(encounter: Encounter): void {
    setEncounter(encounter);
  }

  if (!encounter) {
    return <Loading />;
  }

  return (
    <Paper>
      <EncounterHeader encounter={encounter} patient={patient} />
      <Grid>
        <Grid.Col span={4}>
          <Document>
            <PatientSummary patient={patientReference} />
          </Document>
        </Grid.Col>
        <Grid.Col span={5}>
          <EncounterDetails encounter={encounter} />
        </Grid.Col>
        <Grid.Col span={3}>
          <Document p="xs">
            <EncounterActions encounter={encounter} onChange={handleEncounterChange} />
          </Document>
        </Grid.Col>
      </Grid>
    </Paper>
  );
}
