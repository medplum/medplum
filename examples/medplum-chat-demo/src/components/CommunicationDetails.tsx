import { Paper, Tabs, Title } from '@mantine/core';
import { Communication } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, ResourceHistoryTable, ResourceTable } from '@medplum/react';
import { useNavigate } from 'react-router-dom';

interface CommunicationDetailsProps {
  readonly communication: Communication;
}

export function CommunicationDetails({ communication }: CommunicationDetailsProps): JSX.Element {
  const navigate = useNavigate();
  const id = communication.id as string;
  const tabs = ['Details', 'History'];

  // Get the current tab
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  function handleTabChange(newTab: string | null): void {
    navigate(`/Communication/${id}/${newTab ?? ''}`);
  }

  return (
    <Paper m="md" p="md">
      <Title>
        <CodeableConceptDisplay value={communication.topic} />
      </Title>
      <Tabs defaultValue="details" value={currentTab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab.toLowerCase()}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <ResourceTable value={communication} ignoreMissingValues={true} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTable resourceType="Communication" id={communication.id} />
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
}
