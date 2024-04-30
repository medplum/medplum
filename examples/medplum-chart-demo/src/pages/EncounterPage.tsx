import { Grid, Paper } from '@mantine/core';
import { Encounter, Patient, Reference } from '@medplum/fhirtypes';
import { Document, Loading, PatientSummary, useMedplum, useResource } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EncounterActions } from '../components/EncounterActions';
import { EncounterDetails } from '../components/EncounterDetails';
import { EncounterHeader } from '../components/EncounterHeader';

export function EncounterPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [encounter, setEncounter] = useState<Encounter>(
    useResource<Encounter>({ reference: `Encounter/${id}` }) as Encounter
  );

  const patientReference = encounter?.subject as Reference<Patient>;
  const patient = useResource<Patient>(patientReference);

  function handleEncounterChange(encounter: Encounter): void {
    setEncounter(encounter);
  }

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        if (id) {
          const encounter = await medplum.readResource('Encounter', id);
          setEncounter(encounter);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchData().catch(console.error);
  });

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
