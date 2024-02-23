import { Grid, Paper } from '@mantine/core';
import { getReferenceString, Operator, resolveId, SearchRequest } from '@medplum/core';
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
  const [coverageKey, setCoverageKey] = useState<number>(0);
  const [requestSearch, setRequestSearch] = useState<SearchRequest>({
    resourceType: 'CoverageEligibilityRequest',
    fields: ['patient', 'purpose', 'item', 'insurance'],
  });
  const [responseSearch, setResponseSearch] = useState<SearchRequest>({
    resourceType: 'CoverageEligibilityResponse',
    fields: ['patient', 'outcome', 'disposition', 'insurance'],
  });

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
        }
      }
    };

    fetchCoverage();
    fetchLinkedPatient();
  });

  useEffect(() => {
    const updateEligibilitySearch = (coverage: Coverage) => {
      setRequestSearch({
        ...requestSearch,
        filters: [{ code: 'patient', operator: Operator.EQUALS, value: getReferenceString(coverage.beneficiary) }],
      });

      setResponseSearch({
        ...responseSearch,
        filters: [{ code: 'patient', operator: Operator.EQUALS, value: getReferenceString(coverage.beneficiary) }],
      });
    };

    if (coverage) {
      updateEligibilitySearch(coverage);
    }
  }, [requestSearch, responseSearch, coverage]);

  const onCoverageChange = (updatedCoverage: Coverage): void => {
    setCoverage(updatedCoverage);
    setCoverageKey((prevKey) => prevKey + 1);
  };

  const onEligibilityChange = (coverage: Coverage) => {
    setRequestSearch({
      ...requestSearch,
      filters: [{ code: 'patient', operator: Operator.EQUALS, value: getReferenceString(coverage.beneficiary) }],
    });
    setResponseSearch({
      ...responseSearch,
      filters: [{ code: 'patient', operator: Operator.EQUALS, value: getReferenceString(coverage.beneficiary) }],
    });
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
              requestSearch={requestSearch}
              responseSearch={responseSearch}
              key={coverageKey}
            />
          </Paper>
        </Grid.Col>
        <Grid.Col span={3}>
          <Actions coverage={coverage} onCoverageChange={onCoverageChange} onEligibilityChange={onEligibilityChange} />
        </Grid.Col>
      </Grid>
    </div>
  );
}

interface ActionsProps {
  readonly coverage: Coverage;
  readonly onCoverageChange: (updatedCoverage: Coverage) => void;
  readonly onEligibilityChange: (Coverage: Coverage) => void;
}

function Actions({ coverage, onCoverageChange, onEligibilityChange }: ActionsProps): JSX.Element {
  return (
    <Paper p="md">
      <CoverageActions
        coverage={coverage}
        onCoverageChange={onCoverageChange}
        onEligibilityChange={onEligibilityChange}
      />
    </Paper>
  );
}
