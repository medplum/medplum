import { Paper, ScrollArea, Tabs, Title } from '@mantine/core';
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

export function CoverageDetails(props: CoverageDetailsProps): JSX.Element {
  const navigate = useNavigate();

  // A search request to show all CoverageEligibilityRequest resources that are related the current coverage's beneficiary
  const eligibilityRequestSearch: SearchRequest = {
    resourceType: 'CoverageEligibilityRequest',
    filters: [{ code: 'patient', operator: Operator.EQUALS, value: getReferenceString(props.coverage.beneficiary) }],
    fields: ['patient', 'purpose', 'item', 'insurance'],
  };

  // A search request to show all CoverageEligibilityResponse resources that are related the current coverage's beneficiary
  const eligibilityResponseSearch: SearchRequest = {
    resourceType: 'CoverageEligibilityResponse',
    filters: [{ code: 'patient', operator: Operator.EQUALS, value: getReferenceString(props.coverage.beneficiary) }],
    fields: ['patient', 'outcome', 'disposition', 'insurance'],
  };

  return (
    <Paper>
      <Title>Coverage Details</Title>
      <Tabs value={props.currentTab.toLowerCase()} onChange={props.handleTabChange}>
        <ScrollArea type="never">
          <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }} mb="sm">
            {props.tabs.map((tab) => (
              <Tabs.Tab key={tab[1]} value={tab[0].toLowerCase()}>
                {tab[1]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </ScrollArea>
        <Tabs.Panel value="details">
          <ResourceTable key={`Coverage/${props.coverage.id}`} value={props.coverage} ignoreMissingValues={true} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTable resourceType="Coverage" id={props.coverage.id} />
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
