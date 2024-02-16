import { Paper, Tabs } from '@mantine/core';
import { getReferenceString, Operator, SearchRequest } from '@medplum/core';
import { Coverage, Patient } from '@medplum/fhirtypes';
import { ResourceHistoryTable, ResourceTable, SearchControl, useMedplum } from '@medplum/react';
import { useNavigate } from 'react-router-dom';

interface CoverageDetailsProps {
  readonly coverage: Coverage;
  readonly tabs: string[][];
  readonly currentTab: string;
  readonly handleTabChange: (newTab: string | null) => void;
}

export function CoverageDetails({ coverage, tabs, currentTab, handleTabChange }: CoverageDetailsProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();

  const eligibilityRequestSearch: SearchRequest = {
    resourceType: 'CoverageEligibilityRequest',
    filters: [{ code: 'patient', operator: Operator.EQUALS, value: getReferenceString(coverage.beneficiary) }],
    fields: ['status', 'patient', 'outcome'],
  };

  const eligibilityResponseSearch: SearchRequest = {
    resourceType: 'CoverageEligibilityResponse',
    filters: [{ code: 'patient', operator: Operator.EQUALS, value: getReferenceString(coverage.beneficiary) }],
    fields: ['status', 'patient', 'outcome'],
  };

  return (
    <Paper>
      <Tabs value={currentTab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab[1]} value={tab[0].toLowerCase()}>
              {tab[1]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <ResourceTable key={`Coverage/${coverage.id}`} value={coverage} ignoreMissingValues={true} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTable resourceType="Coverage" id={coverage.id} />
        </Tabs.Panel>
        <Tabs.Panel value="requests">
          <SearchControl
            search={eligibilityRequestSearch}
            onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
            hideFilters={true}
            hideToolbar={true}
          />
        </Tabs.Panel>
        <Tabs.Panel value="responses">
          <SearchControl
            search={eligibilityResponseSearch}
            onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
            hideFilters={true}
            hideToolbar={true}
          />
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
}
