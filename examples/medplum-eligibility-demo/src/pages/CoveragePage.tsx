import { Grid, Paper } from '@mantine/core';
import { normalizeErrorString, resolveId } from '@medplum/core';
import { Coverage, Patient } from '@medplum/fhirtypes';
import { Loading, PatientSummary, useMedplum, useMedplumNavigate } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CoverageActions } from '../components/actions/CoverageActions';
import { CoverageDetails } from '../components/CoverageDetails';
import { CoverageHeader } from '../components/CoverageHeader';

export function CoveragePage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useMedplumNavigate();
  const { id } = useParams() as { id: string };
  const [coverage, setCoverage] = useState<Coverage | undefined>();
  const [patient, setPatient] = useState<Patient>();

  const tabs = [
    ['Details', 'Details'],
    ['History', 'History'],
    ['Requests', 'Eligibility Requests'],
    ['Responses', 'Eligibility Responses'],
  ];

  // Set the current tab to what is in the URL. If no tab, default to Details
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t[0].toLowerCase()).includes(tab) ? tab : tabs[0][0].toLowerCase();

  // Get a reference to the patient covered by the Coverage
  const patientReference = coverage?.beneficiary;

  useEffect(() => {
    const fetchCoverage = async (): Promise<void> => {
      try {
        // Get the coverage details for the given resource. For more details on Coverage, see https://www.medplum.com/docs/billing/patient-insurance
        const coverageData = await medplum.readResource('Coverage', id);
        setCoverage(coverageData);
      } catch (err) {
        console.error(err);
        throw new Error(normalizeErrorString(err));
      }
    };

    const fetchLinkedPatient = async (): Promise<void> => {
      if (patientReference) {
        const patientId = resolveId(patientReference) as string;
        try {
          // Search for the details of the patient covered by the Coverage
          const patientData = await medplum.readResource('Patient', patientId);
          setPatient(patientData);
        } catch (err) {
          console.error(err);
          throw new Error(normalizeErrorString(err));
        }
      }
    };

    fetchCoverage().catch((error) => console.error(error));
    fetchLinkedPatient().catch((error) => console.error(error));
  });

  const onCoverageChange = (updatedCoverage: Coverage): void => {
    setCoverage(updatedCoverage);
  };

  // Update the current tab and navigate to its URL
  const handleTabChange = (newTab: string | null): void => {
    navigate(`/Coverage/${id}/${newTab ?? ''}`);
  };

  if (!coverage || !patient) {
    return <Loading />;
  }

  return (
    <div>
      <CoverageHeader patient={patient} payor={coverage.payor[0]} />
      <Grid>
        <Grid.Col span={4}>{patient ? <PatientSummary patient={patient} /> : <p>No linked patient</p>}</Grid.Col>
        <Grid.Col span={5}>
          <Paper p="sm">
            <CoverageDetails
              coverage={coverage}
              tabs={tabs}
              currentTab={currentTab}
              handleTabChange={handleTabChange}
            />
          </Paper>
        </Grid.Col>
        <Grid.Col span={3}>
          <Actions coverage={coverage} onCoverageChange={onCoverageChange} />
        </Grid.Col>
      </Grid>
    </div>
  );
}

interface ActionsProps {
  readonly coverage: Coverage;
  readonly onCoverageChange: (updatedCoverage: Coverage) => void;
}

function Actions({ coverage, onCoverageChange }: ActionsProps): JSX.Element {
  return (
    <Paper p="md">
      <CoverageActions coverage={coverage} onCoverageChange={onCoverageChange} />
    </Paper>
  );
}
