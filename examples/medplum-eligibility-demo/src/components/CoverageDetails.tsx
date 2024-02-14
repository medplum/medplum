import { Paper, Tabs } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Coverage, Patient } from '@medplum/fhirtypes';
import { ResourceHistoryTable, ResourceTable, useMedplum } from '@medplum/react';
import { useEffect } from 'react';

interface CoverageDetailsProps {
  readonly coverage: Coverage;
  readonly patient?: Patient;
  readonly tabs: string[];
  readonly currentTab: string;
  readonly handleTabChange: (newTab: string | null) => void;
}

export function CoverageDetails({
  coverage,
  patient,
  tabs,
  currentTab,
  handleTabChange,
}: CoverageDetailsProps): JSX.Element {
  const medplum = useMedplum();

  useEffect(() => {
    const fetchEligibilityRequests = async (): Promise<void> => {
      if (!patient) {
        return;
      }

      try {
        // Search for all CoverageEligibilityRequest resources that reference the covered patient
        const eligibilityRequests = await medplum.searchResources('CoverageEligibilityRequest', {
          patient: getReferenceString(patient),
        });
      } catch (err) {
        console.error(err);
      }
    };

    const fetchEligibilityResponses = async (): Promise<void> => {
      if (!patient) {
        return;
      }

      try {
        // Search for all CoverageEligibilityResponse resources that reference the covered patient
        const eligibilityResponses = await medplum.searchResources('CoverageEligibilityResponse', {
          patient: getReferenceString(patient),
        });
      } catch (err) {
        console.error(err);
      }
    };

    fetchEligibilityRequests();
    fetchEligibilityResponses();
  });

  return (
    <Paper>
      <Tabs value={currentTab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab.toLowerCase()}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <ResourceTable key={`Coverage/${coverage.id}`} value={coverage} ignoreMissingValues={true} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTable resourceType="Coverage" id={coverage.id} />
        </Tabs.Panel>
      </Tabs>
      <ResourceTable value={coverage} />
    </Paper>
  );
}
