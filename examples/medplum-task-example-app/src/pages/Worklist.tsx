import { Tabs } from '@mantine/core';
import { getReferenceString, Operator, SearchRequest } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { Document, SearchControl, useMedplumProfile } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function Worklist(): JSX.Element {
  const profile = useMedplumProfile() as Resource;
  const navigate = useNavigate();
  const [search, setSearch] = useState<SearchRequest>({ resourceType: 'Task' });
  const tabs = ['Active', 'Completed'];
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tab = window.location.pathname.split('/').pop();
    return tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();
  });

  const handleTabChange = (newTab: string) => {
    setCurrentTab(newTab);
    navigate(`/Task/worklist/${newTab}`);
  };

  useEffect(() => {
    const filters = [{ code: 'owner', operator: Operator.EQUALS, value: `${getReferenceString(profile)}` }];
    const fields = ['id', '_lastUpdated', 'owner', 'priority', 'for'];
    const sortRules = [{ code: '-priority-order,due-date' }];

    if (currentTab === 'active') {
      filters.push({ code: 'status:not', operator: Operator.EQUALS, value: 'completed' });
    } else {
      filters.push({ code: 'status', operator: Operator.EQUALS, value: 'completed' });
    }

    const populatedSearch = {
      ...search,
      filters,
      fields,
      sortRules,
    };

    setSearch(populatedSearch);
  }, [currentTab]);

  return (
    <Document>
      <Tabs value={currentTab.toLowerCase()} onTabChange={handleTabChange}>
        <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab.toLowerCase()}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="active">
          <SearchControl
            search={search}
            onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
            hideToolbar={true}
            hideFilters={true}
          />
        </Tabs.Panel>
        <Tabs.Panel value="completed">
          <SearchControl
            search={search}
            onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
            hideToolbar={true}
            hideFilters={true}
          />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
