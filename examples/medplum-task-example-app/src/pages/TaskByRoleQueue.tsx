import { Tabs } from '@mantine/core';
import { Filter, getReferenceString, Operator, ResourceArray, SearchRequest } from '@medplum/core';
import { Practitioner, PractitionerRole } from '@medplum/fhirtypes';
import { Document, SearchControl, useMedplum, useMedplumProfile } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function TaskByRoleQueue(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const navigate = useNavigate();
  const [roles, setRoles] = useState<PractitionerRole[]>();
  const tabs = ['Active', 'Completed'];
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tab = window.location.pathname.split('/').pop();
    return tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();
  });
  const [search, setSearch] = useState<SearchRequest>({ resourceType: 'Task' });

  const handleTabChange = (newTab: string) => {
    setCurrentTab(newTab);
    navigate(`/Task/queue/${newTab}`);
  };

  useEffect(() => {
    // Search for all PractitionerRoles for the logged in user
    const getUserPractitionerRoles = async () => {
      const results: ResourceArray<PractitionerRole> = await medplum.searchResources('PractitionerRole', {
        practitioner: `Practitioner/${profile.id}`,
      });

      const practitionerRoles: PractitionerRole[] = results.filter(
        (result) => result.resourceType === 'PractitionerRole'
      );

      setRoles(practitionerRoles);
    };

    getUserPractitionerRoles();
  }, []);

  useEffect(() => {
    // Add a filter to only show tasks without an owner
    const filters: Filter[] = [{ code: 'owner:missing', operator: Operator.EQUALS, value: 'true' }];

    if (roles) {
      // Add a filter for each of the user's roles
      for (const role of roles) {
        const roleCode = role.specialty?.[0].coding?.[0];

        if (roleCode?.code) {
          const filter: Filter = { code: 'performer', operator: Operator.EQUALS, value: roleCode.code };
          filters.push(filter);
        }
      }
    }

    // Add filters for active and complete tabs
    addActiveOrCompletedFilters(filters, currentTab);

    const fields = ['id', 'priority', 'description', 'for'];
    const sortRules = [{ code: '-priority-order,due-date' }];

    const populatedSearch = {
      ...search,
      fields,
      sortRules,
      filters,
    };

    setSearch(populatedSearch);
  }, [roles, currentTab]);

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
            hideFilters={true}
            hideToolbar={true}
          />
        </Tabs.Panel>
        <Tabs.Panel value="completed">
          <SearchControl
            search={search}
            onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
            hideFilters={true}
            hideToolbar={true}
          />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}

function addActiveOrCompletedFilters(filters: Filter[], currentTab: string) {
  if (currentTab === 'active') {
    filters.push({ code: 'status:not', operator: Operator.EQUALS, value: 'completed' });
  } else {
    filters.push({ code: 'status', operator: Operator.EQUALS, value: 'completed' });
  }
}
