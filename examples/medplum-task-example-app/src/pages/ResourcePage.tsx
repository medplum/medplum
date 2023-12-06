import { Tabs, Title } from '@mantine/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import { Resource, ResourceType } from '@medplum/fhirtypes';
import { DefaultResourceTimeline, Document, ResourceTable, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { NotesPage } from './NotesPage';

/**
 * This is an example of a generic "Resource Display" page.
 * It uses the Medplum `<ResourceTable>` component to display a resource.
 * @returns A React component that displays a resource.
 */
export function ResourcePage(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { resourceType, id } = useParams();
  const [resource, setResource] = useState<Resource | undefined>(undefined);
  const tabs = ['Details', 'Timeline', 'Notes'];
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tab = window.location.pathname.split('/').pop();
    return tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();
  });

  useEffect(() => {
    if (resourceType && id) {
      medplum
        .readResource(resourceType as ResourceType, id)
        .then(setResource)
        .catch(console.error);
    }
  }, [medplum, resourceType, id]);

  // Update the tab and navigate to that tab's URL
  const handleTabChange = (newTab: string) => {
    setCurrentTab(newTab);
    navigate(`/${resourceType}/${id}/${newTab}`);
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
      </Tabs>
      {currentTab === 'details' && <ResourceTable key={`${resourceType}/${id}`} value={resource} />}
      {currentTab === 'timeline' && <DefaultResourceTimeline resource={resource} />}
      {/* {currentTab === 'notes' && <NotesPage task={resource} />} */}
    </Document>
  );
}
