import { Button, Group, LoadingOverlay, Stack, Table, Tabs, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { forbidden, formatSearchQuery, normalizeErrorString, Operator, SearchRequest, WithId } from '@medplum/core';
import { AsyncJob, Resource } from '@medplum/fhirtypes';
import { Container, MedplumLink, OperationOutcomeAlert, Panel, SearchControl, useMedplum } from '@medplum/react';
import { IconMinus, IconPlus, IconRefresh } from '@tabler/icons-react';
import { JSX, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { startAsyncJobAsync } from './SuperAdminStartAsyncJob';

const SYSTEM_ASYNCJOB = 'System AsyncJob';
const POSTDEPLOY_MIGRATIONS = 'Post-deploy Migrations';
const TABS = [POSTDEPLOY_MIGRATIONS, SYSTEM_ASYNCJOB];

export function SuperAdminAsyncDashboardPage(): JSX.Element {
  const medplum = useMedplum();
  const [currentTab, setCurrentTab] = useState(TABS[0]);

  function onTabChange(newTabName: string | null): void {
    newTabName ||= TABS[0];
    if (TABS.includes(newTabName)) {
      setCurrentTab(newTabName);
    }
  }

  if (!medplum.isLoading() && !medplum.isSuperAdmin()) {
    return <OperationOutcomeAlert outcome={forbidden} />;
  }

  return (
    <Container miw="1600" maw="2000">
      <Panel>
        <Title order={1}>AsyncJob Dashboard</Title>
        <Tabs keepMounted={false} value={currentTab} onChange={onTabChange}>
          <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
            {TABS.map((t) => (
              <Tabs.Tab key={t} value={t}>
                {t}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value={SYSTEM_ASYNCJOB} pt="md">
            <AsyncJobs />
          </Tabs.Panel>
          <Tabs.Panel value={POSTDEPLOY_MIGRATIONS} pt="md">
            <PostDeployMigrations />
          </Tabs.Panel>
        </Tabs>
      </Panel>
    </Container>
  );
}

const SYSTEM_ASYNCJOB_SEARCH: SearchRequest = {
  resourceType: 'AsyncJob',
  fields: ['id', '_lastUpdated', 'request', 'status', 'type'],
  filters: [
    /* { code: 'status', operator: 'in', value: 'accepted,completed' } */
    { code: '_project', operator: Operator.MISSING, value: 'true' },
  ],
  sortRules: [{ code: '_lastUpdated', descending: true }],
};

function AsyncJobs(): JSX.Element {
  const navigate = useNavigate();
  const [search] = useState<SearchRequest>(SYSTEM_ASYNCJOB_SEARCH);

  return (
    <Stack>
      <MedplumLink to={`/${search.resourceType}/${formatSearchQuery(search)}`}>Show in search page</MedplumLink>
      <SearchControl
        checkboxesEnabled={false}
        search={search}
        onClick={(e) => navigate(getResourceUrl(e.resource))?.catch(console.error)}
        onAuxClick={(e) => window.open(getResourceUrl(e.resource), '_blank')}
      />
    </Stack>
  );
}

const POSTDEPLOY_MIGRATIONS_SEARCH: SearchRequest = {
  resourceType: 'AsyncJob',
  fields: ['id', '_lastUpdated', 'request', 'status', 'type'],
  filters: [
    { code: '_project', operator: Operator.MISSING, value: 'true' },
    { code: 'type', operator: Operator.EQUALS, value: 'data-migration' },
  ],
  count: 1000,
  sortRules: [{ code: '_lastUpdated', descending: true }],
};

type MigrationInfo = {
  postDeployMigrations: number[];
  pendingPostDeployMigration: number;
};

function PostDeployMigrations(): JSX.Element {
  const medplum = useMedplum();
  const [migrationInfo, setMigrationInfo] = useState<MigrationInfo>();
  const [pdmAsyncJobs, setPDMAsyncJobs] = useState<WithId<AsyncJob>[] | undefined>();
  const [showAllVersions, setShowAllVersions] = useState<number[]>([]);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [loadingItems, setLoadingItems] = useState<string[]>([]);

  useEffect(() => {
    const loadingName = 'info';
    setLoadingItems((prev) => (prev.includes(loadingName) ? prev : [...prev, loadingName]));
    medplum
      .get('admin/super/migrations', { cache: 'no-cache' })
      .then((res: MigrationInfo) => {
        res.postDeployMigrations.sort((a, b) => b - a);
        setMigrationInfo(res);
      })
      .catch((err) => {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      })
      .finally(() => setLoadingItems((prev) => prev.filter((item) => item !== loadingName)));
  }, [medplum, refreshCounter]);

  useEffect(() => {
    const loadingName = 'jobs';
    setLoadingItems((prev) => (prev.includes(loadingName) ? prev : [...prev, loadingName]));
    medplum
      .requestSchema('AsyncJob')
      .then(() =>
        medplum
          .search(
            'AsyncJob',
            formatSearchQuery({ ...POSTDEPLOY_MIGRATIONS_SEARCH, total: 'accurate', fields: undefined }),
            { cache: 'no-cache' }
          )
          .then((asyncJobResults) => {
            setPDMAsyncJobs(asyncJobResults.entry?.map((entry) => entry.resource as WithId<AsyncJob>));
          })
      )
      .catch((err) => {
        setPDMAsyncJobs(undefined);
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      })
      .finally(() => setLoadingItems((prev) => prev.filter((item) => item !== loadingName)));
  }, [medplum, refreshCounter]);

  function triggerRefresh(): void {
    setRefreshCounter((prev) => prev + 1);
  }

  function runPendingDataMigration(version: number): void {
    startAsyncJobAsync(medplum, 'Run Pending Data Migration', 'admin/super/migrate', { dataVersion: version })
      .finally(() => {
        triggerRefresh();
      })
      .catch(() => {});
    triggerRefresh();
  }

  const isLoading = loadingItems.length > 0;

  function renderTable(callback: () => React.ReactNode, { isLoading }: { isLoading: boolean }): JSX.Element {
    return (
      <div style={{ position: 'relative' }}>
        <LoadingOverlay visible={isLoading} />
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Version</Table.Th>
              <Table.Th>Action</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>AsyncJob</Table.Th>
              <Table.Th>Last Updated</Table.Th>
              <Table.Th>Request Time</Table.Th>
              <Table.Th>Duration</Table.Th>
              <Table.Th>Attempts</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{callback()}</Table.Tbody>
        </Table>
      </div>
    );
  }

  return (
    <>
      <Button
        size="xs"
        mb="xs"
        variant="subtle"
        leftSection={<IconRefresh size={14} />}
        onClick={triggerRefresh}
        loading={isLoading}
      >
        Refresh
      </Button>
      {renderTable(
        () => {
          if (!isLoading) {
            if (!migrationInfo) {
              return (
                <Table.Tr>
                  <Table.Td colSpan={6}>Failed to load migration info</Table.Td>
                </Table.Tr>
              );
            }

            if (!pdmAsyncJobs) {
              return (
                <Table.Tr>
                  <Table.Td colSpan={6}>Failed to load async jobs</Table.Td>
                </Table.Tr>
              );
            }
          }

          if (!migrationInfo || !pdmAsyncJobs) {
            return null;
          }

          return migrationInfo.postDeployMigrations?.map((version) => {
            const { status, asyncJob, asyncJobs } = getPostDeployMigrationStatus(
              version,
              pdmAsyncJobs ?? [],
              migrationInfo?.pendingPostDeployMigration
            );
            const showAll = showAllVersions.includes(version);

            const showStartButton =
              version === migrationInfo?.pendingPostDeployMigration && (!asyncJob || asyncJob?.status === 'error');

            const toShow = [
              <Table.Tr key={version}>
                <Table.Td>{version}</Table.Td>
                <Table.Td>
                  {showStartButton && (
                    <Button color="green" size="xs" onClick={() => runPendingDataMigration(version)}>
                      Start
                    </Button>
                  )}
                </Table.Td>
                <Table.Td>{status}</Table.Td>
                <Table.Td>
                  {asyncJob && <MedplumLink to={`/AsyncJob/${asyncJob?.id}`}>{asyncJob?.id}</MedplumLink>}
                </Table.Td>
                <Table.Td>{asyncJob?.meta?.lastUpdated}</Table.Td>
                <Table.Td>{asyncJob?.requestTime}</Table.Td>
                <Table.Td>{getDuration(asyncJob)}</Table.Td>
                <Table.Td display="flex">
                  <Group gap="xs">
                    {asyncJobs.length ? asyncJobs.length : ''}
                    {showAll && asyncJobs.length > 1 && (
                      <Button
                        leftSection={<IconMinus size={14} />}
                        variant="subtle"
                        color="blue"
                        size="xs"
                        radius="xs"
                        onClick={() =>
                          setShowAllVersions((prev) =>
                            prev.includes(version) ? prev.filter((v) => v !== version) : prev
                          )
                        }
                      >
                        Hide all
                      </Button>
                    )}
                    {!showAll && asyncJobs.length > 1 && (
                      <Button
                        leftSection={<IconPlus size={14} />}
                        variant="subtle"
                        color="blue"
                        size="xs"
                        radius="xs"
                        onClick={() =>
                          setShowAllVersions((prev) => (prev.includes(version) ? prev : [...prev, version]))
                        }
                      >
                        Show all
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>,
            ];

            if (showAll) {
              toShow.push(
                ...asyncJobs
                  .filter((aj) => aj.id !== asyncJob?.id)
                  .map((aj) => (
                    <Table.Tr key={aj.id} bg="gray.1">
                      <Table.Td>{version}</Table.Td>
                      <Table.Td></Table.Td>
                      <Table.Td>{aj.status}</Table.Td>
                      <Table.Td>
                        <MedplumLink to={`/AsyncJob/${aj.id}`}>{aj.id}</MedplumLink>
                      </Table.Td>
                      <Table.Td>{aj.meta?.lastUpdated}</Table.Td>
                      <Table.Td>{aj.requestTime}</Table.Td>
                      <Table.Td>{getDuration(aj)}</Table.Td>
                      <Table.Td></Table.Td>
                    </Table.Tr>
                  ))
              );
            }

            return toShow;
          });
        },
        { isLoading }
      )}
    </>
  );
}

function getPostDeployMigrationStatus(
  version: number,
  sortedAsyncJobs: WithId<AsyncJob>[],
  pendingPostDeployMigration: number
): { status: string; asyncJob: WithId<AsyncJob> | undefined; asyncJobs: WithId<AsyncJob>[] } {
  const asyncJobs = sortedAsyncJobs.filter((aj) => aj.dataVersion === version);
  const asyncJob = asyncJobs.find((aj) => aj.status === 'completed') ?? asyncJobs[0];
  let status: string;
  if (pendingPostDeployMigration === 0) {
    status = asyncJob?.status ?? 'completed';
  } else if (version > pendingPostDeployMigration) {
    status = asyncJob?.status ?? 'pending';
  } else if (version === pendingPostDeployMigration) {
    status = asyncJob?.status ?? 'next';
  } else {
    status = asyncJob?.status ?? 'completed';
  }

  return { status, asyncJob, asyncJobs };
}

function getResourceUrl<T extends Resource>(resource: T): string {
  return `/${resource.resourceType}/${resource.id}`;
}

function getDuration(asyncJob: WithId<AsyncJob> | undefined): string {
  const start = asyncJob?.requestTime;
  const end = asyncJob?.transactionTime ?? asyncJob?.meta?.lastUpdated;
  if (!start || !end) {
    return '';
  }

  const startTime = new Date(start);
  const endTime = new Date(end);
  const diffInMs = endTime.getTime() - startTime.getTime();

  if (diffInMs < 1000) {
    return `${diffInMs.toFixed(0)}ms`;
  }

  const diffInS = diffInMs / 1000;

  if (diffInS < 60) {
    return `${diffInS.toFixed(2)}s`;
  }

  if (diffInS < 3600) {
    return `${(diffInS / 60).toFixed(2)}m`;
  }

  return `${(diffInS / 3600).toFixed(2)}h`;
}
