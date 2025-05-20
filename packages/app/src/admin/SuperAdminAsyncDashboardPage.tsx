import { Tabs, Title } from '@mantine/core';
import { forbidden, isReference, SearchRequest } from '@medplum/core';
import { ExtractResource, Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import { Container, Loading, OperationOutcomeAlert, Panel, SearchControl, useMedplum } from '@medplum/react';
import { JSX, useState } from 'react';
import { useNavigate } from 'react-router';

const TABS = ['AsyncJobs', 'Post-deploy Migrations', 'Job Queues'];
export function SuperAdminAsyncDashboardPage(): JSX.Element {
  const medplum = useMedplum();
  const [currentTab, setCurrentTab] = useState(TABS[0]);

  function onTabChange(newTabName: string | null): void {
    if (!newTabName) {
      newTabName = TABS[0];
    }
    if (TABS.includes(newTabName)) {
      setCurrentTab(newTabName);
    }
  }

  if (!medplum.isLoading() && !medplum.isSuperAdmin()) {
    return <OperationOutcomeAlert outcome={forbidden} />;
  }

  return (
    <Container maw="100%">
      <Panel>
        <Title order={1}>AsyncJob Dashboard</Title>
        <Tabs value={currentTab} onChange={onTabChange}>
          <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
            {TABS.map((t) => (
              <Tabs.Tab key={t} value={t}>
                {t}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="Post-deploy Migrations" pt="md">
            <PostDeployMigrations />
          </Tabs.Panel>
          <Tabs.Panel value="Job Queues" pt="md">
            <JobQueues />
          </Tabs.Panel>
          <Tabs.Panel value="AsyncJobs" pt="md">
            <AsyncJobs />
          </Tabs.Panel>
        </Tabs>
      </Panel>
    </Container>
  );
}

const DEFAULT_SEARCH: SearchRequest = {
  resourceType: 'AsyncJob',
  fields: ['id', '_lastUpdated', 'request', 'status', 'type'],
  filters: [
    /* { code: 'status', operator: 'in', value: 'accepted,completed' } */
  ],
  sortRules: [{ code: '_lastUpdated', descending: true }],
};

function AsyncJobs(): JSX.Element {
  // const medplum = useMedplum();
  const navigate = useNavigate();
  const [search] = useState<SearchRequest>(DEFAULT_SEARCH);

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <SearchControl
      checkboxesEnabled={false}
      search={search}
      onClick={(e) => navigate(getResourceUrl(e.resource))?.catch(console.error)}
      onAuxClick={(e) => window.open(getResourceUrl(e.resource), '_blank')}
      // onNew={() => {
      //   navigate(`/${search.resourceType}/new`)?.catch(console.error);
      // }}
      // onChange={(e) => {
      //   navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`)?.catch(console.error);
      // }}
    />
  );
}

function PostDeployMigrations(): JSX.Element {
  return <div>PostDeployMigrations</div>;
}

function JobQueues(): JSX.Element {
  return <div>JobQueues</div>;
}

function getResourceUrl<T extends Resource>(resource: T): string {
  const patientFields = ['patient', 'subject', 'sender'] as (keyof T)[];
  for (const key of patientFields) {
    if (key in resource) {
      const value = resource[key];
      if (isReferenceOfType('Patient', value)) {
        return `/${value.reference}/${resource.resourceType}/${resource.id}`;
      }
    }
  }
  return `/${resource.resourceType}/${resource.id}`;
}

function isReferenceOfType<T extends ResourceType>(
  resourceType: T,
  value: unknown
): value is Reference<ExtractResource<T>> & { reference: string } {
  return isReference(value) && value.reference.startsWith(resourceType + '/');
}
