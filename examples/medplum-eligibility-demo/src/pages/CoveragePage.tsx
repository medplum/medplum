import { Grid, Paper } from '@mantine/core';
import { resolveId } from '@medplum/core';
import { Coverage, Patient } from '@medplum/fhirtypes';
import {
  Document,
  PatientSummary,
  ResourceForm,
  ResourceHistoryTable,
  ResourceTable,
  useMedplum,
  useMedplumNavigate,
} from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CoverageDetails } from '../components/CoverageDetails';

export function CoveragePage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useMedplumNavigate();
  const { id } = useParams() as { id: string };
  const [coverage, setCoverage] = useState<Coverage | undefined>();
  const [patient, setPatient] = useState<Patient | undefined>();

  const tabs = ['Details', 'History', 'Eligibility Requests', 'Eligibility Responses'];

  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  const patientReference = coverage?.beneficiary;

  useEffect(() => {
    const fetchCoverage = async (): Promise<void> => {
      try {
        const coverageData = await medplum.readResource('Coverage', id);
        setCoverage(coverageData);
      } catch (err) {
        console.error(err);
      }
    };

    const fetchLinkedPatient = async (): Promise<void> => {
      if (patientReference) {
        const patientId = resolveId(patientReference) as string;
        try {
          const patientData = await medplum.readResource('Patient', patientId);
          setPatient(patientData);
        } catch (err) {
          console.error(err);
        }
      }
    };

    const fetchData = async (): Promise<void> => {
      await fetchCoverage();
      await fetchLinkedPatient();
    };

    fetchData().catch((err) => console.error(err));
  });

  // Update the current tab and navigate to its URL
  const handleTabChange = (newTab: string | null): void => {
    navigate(`/Task/${id}/${newTab ?? ''}`);
  };

  if (!coverage) {
    return <Document>No Coverage Found</Document>;
  }

  return (
    <Grid>
      <Grid.Col span={4}>{patient ? <PatientSummary patient={patient} /> : <p>No linked patient</p>}</Grid.Col>
      <Grid.Col span={5}>
        <CoverageDetails
          coverage={coverage}
          patient={patient}
          tabs={tabs}
          currentTab={currentTab}
          handleTabChange={handleTabChange}
        />
      </Grid.Col>
      <Grid.Col span={3}>
        <Actions />
      </Grid.Col>
    </Grid>
  );
}

function Actions(): JSX.Element {
  return (
    <Paper>
      <div>Coverage Actions</div>
      <ul>
        <li>Initiate Coverage Eligibility Request</li>
        <li>Edit Coverage</li>
      </ul>
    </Paper>
  );
}
