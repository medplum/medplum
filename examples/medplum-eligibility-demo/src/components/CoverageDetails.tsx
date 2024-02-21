import { Paper, Tabs } from '@mantine/core';
import { getReferenceString, Operator, SearchRequest } from '@medplum/core';
import { Coverage } from '@medplum/fhirtypes';
import { ResourceHistoryTable, ResourceTable, SearchControl } from '@medplum/react';
import { useNavigate } from 'react-router-dom';

interface CoverageDetailsProps {
  readonly coverage: Coverage;
  readonly tabs: string[][];
  readonly currentTab: string;
  readonly handleTabChange: (newTab: string | null) => void;
}

export function CoverageDetails({ coverage, tabs, currentTab, handleTabChange }: CoverageDetailsProps): JSX.Element {
  const navigate = useNavigate();

  // A search request to show all CoverageEligibilityRequest resources that are related the current coverage's beneficiary
  const eligibilityRequestSearch: SearchRequest = {
    resourceType: 'CoverageEligibilityRequest',
    filters: [{ code: 'patient', operator: Operator.EQUALS, value: getReferenceString(coverage.beneficiary) }],
    fields: ['patient', 'purpose', 'item', 'insurance'],
  };

  // A search request to show all CoverageEligibilityResponse resources that are related the current coverage's beneficiary
  const eligibilityResponseSearch: SearchRequest = {
    resourceType: 'CoverageEligibilityResponse',
    filters: [{ code: 'patient', operator: Operator.EQUALS, value: getReferenceString(coverage.beneficiary) }],
    fields: ['patient', 'outcome', 'disposition', 'insurance'],
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
