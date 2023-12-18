import { Tabs, Title } from '@mantine/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import { DefaultResourceTimeline, Document, ResourceTable, useResource } from '@medplum/react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ResourceHistoryTab } from '../components/ResourceHistoryTab';

/**
 * This is an example of a generic "Resource Display" page.
 * It uses the Medplum `<ResourceTable>` component to display a resource.
 * @returns A React component that displays a resource.
 */
export function ResourcePage(): JSX.Element | null {
  const { resourceType, id } = useParams();
  const reference = { reference: resourceType + '/' + id };
  const resource = useResource(reference);
  const tabs = ['Details', 'Timeline', 'History'];
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tab = window.location.pathname.split('/').pop();
    return tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();
  });

  // Update the tab and navigate to that tab's URL
  const handleTabChange = (newTab: string): void => {
    setCurrentTab(newTab);
  };

  if (!resource) {
    return null;
  }

  return (
    <Document key={getReferenceString(resource)}>
      <Title>{getDisplayString(resource)}</Title>
      <Tabs value={currentTab.toLowerCase()} onTabChange={handleTabChange}>
        <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab.toLowerCase()}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <ResourceTable key={`${resourceType}/${id}`} value={resource} />
        </Tabs.Panel>
        <Tabs.Panel value="timeline">
          <DefaultResourceTimeline resource={resource} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTab />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
