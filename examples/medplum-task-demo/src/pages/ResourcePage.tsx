import { Paper, Tabs, Title } from '@mantine/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import {
  DefaultResourceTimeline,
  DiagnosticReportDisplay,
  Document,
  ResourceTable,
  useMedplumNavigate,
  useResource,
} from '@medplum/react';
import { useParams } from 'react-router-dom';
import { ResourceHistoryTab } from '../components/ResourceHistoryTab';
import { DiagnosticReport } from '@medplum/fhirtypes';

/**
 * This is an example of a generic "Resource Display" page.
 * It uses the Medplum `<ResourceTable>` component to display a resource.
 * @returns A React component that displays a resource.
 */
export function ResourcePage(): JSX.Element | null {
  const { resourceType, id } = useParams();
  const navigate = useMedplumNavigate();
  const reference = { reference: resourceType + '/' + id };
  const resource = useResource(reference);
  let tabs = ['Details', 'Timeline', 'History'];
  // Special Case for Diagnostic Reporets
  if (resourceType === 'DiagnosticReport') {
    tabs = ['Report', ...tabs];
  }

  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  // Update the tab and navigate to that tab's URL
  const handleTabChange = (newTab: string | null): void => {
    navigate(`/${resourceType}/${id}/${newTab}`);
  };

  if (!resource) {
    return null;
  }

  return (
    <Document key={getReferenceString(resource)}>
      <Title>{getDisplayString(resource)}</Title>
      <Tabs value={currentTab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab.toLowerCase()}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <Paper mt={'lg'}>
            <ResourceTable key={`${resourceType}/${id}`} value={resource} ignoreMissingValues />
          </Paper>
        </Tabs.Panel>
        <Tabs.Panel value="timeline">
          <DefaultResourceTimeline resource={resource} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTab />
        </Tabs.Panel>
        <Tabs.Panel value="report">
          <Document>
            <DiagnosticReportDisplay value={resource as DiagnosticReport} />
          </Document>
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
