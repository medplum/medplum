// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Modal, Table, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { MedplumLink, ReferenceDisplay, ResourceName, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { Fragment, useState } from 'react';

interface WsSubEntryDetail {
  subscriptionId: string;
  criteria: string;
  expiration: number;
  author: string;
}

interface WsSubCriteriaDetailStats {
  criteria: string;
  count: number;
  entries: WsSubEntryDetail[];
}

interface WsSubResourceTypeStats {
  resourceType: string;
  count: number;
}

interface WsSubResourceTypeDetailStats {
  resourceType: string;
  count: number;
  criteria: WsSubCriteriaDetailStats[];
}

interface WsSubProjectStats {
  projectId: string;
  projectName?: string;
  subscriptionCount: number;
  resourceTypes: WsSubResourceTypeStats[];
}

function toggleSetEntry(prev: Set<string>, key: string): Set<string> {
  const next = new Set(prev);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

interface EntryRowProps {
  readonly entry: WsSubEntryDetail;
}

function EntryRow({ entry }: EntryRowProps): JSX.Element {
  return (
    <Table.Tr key={entry.subscriptionId}>
      <Table.Td>
        <div style={{ paddingLeft: 50 }}>
          <Text size="xs" c="dimmed">
            Subscription: <ReferenceDisplay value={{ reference: `Subscription/${entry.subscriptionId}` }} />
          </Text>
          <Text size="xs" c="dimmed">
            Author:{' '}
            <MedplumLink to={{ reference: entry.author }}>
              <ResourceName value={{ reference: entry.author }} />
            </MedplumLink>
          </Text>
          {entry.expiration ? (
            <Text size="xs" c="dimmed">
              Expires at:{' '}
              {new Date(entry.expiration * 1000).toLocaleString(undefined, {
                timeZoneName: 'short',
              })}
            </Text>
          ) : null}
        </div>
      </Table.Td>
      <Table.Td />
    </Table.Tr>
  );
}

interface CriteriaRowProps {
  readonly criteria: WsSubCriteriaDetailStats;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

function CriteriaRow({ criteria, expanded, onToggle }: CriteriaRowProps): JSX.Element {
  return (
    <Fragment>
      <Table.Tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <Table.Td>
          <Group gap="xs" pl="xl">
            <Text size="xs">{expanded ? '▼' : '▶'}</Text>
            <Text size="sm" c="dimmed">
              {criteria.criteria}
            </Text>
          </Group>
        </Table.Td>
        <Table.Td>{criteria.count}</Table.Td>
      </Table.Tr>
      {expanded && criteria.entries?.map((entry) => <EntryRow key={entry.subscriptionId} entry={entry} />)}
    </Fragment>
  );
}

interface ResourceTypeRowProps {
  readonly projectId: string;
  readonly rt: WsSubResourceTypeStats;
  readonly rtDetail?: WsSubResourceTypeDetailStats;
  readonly isLoading: boolean;
  readonly expanded: boolean;
  readonly expandedCriteria: Set<string>;
  readonly onToggle: () => void;
  readonly onToggleCriteria: (key: string) => void;
}

function ResourceTypeRow({
  projectId,
  rt,
  rtDetail,
  isLoading,
  expanded,
  expandedCriteria,
  onToggle,
  onToggleCriteria,
}: ResourceTypeRowProps): JSX.Element {
  const rtKey = `${projectId}:${rt.resourceType}`;
  return (
    <Fragment>
      <Table.Tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <Table.Td>
          <Group gap="xs" pl="md">
            <Text size="xs">{expanded ? '▼' : '▶'}</Text>
            <Text>{rt.resourceType}</Text>
          </Group>
        </Table.Td>
        <Table.Td>{rt.count}</Table.Td>
      </Table.Tr>
      {expanded && (
        <>
          {isLoading && !rtDetail && (
            <Table.Tr>
              <Table.Td colSpan={2}>
                <Text pl="xl" size="sm" c="dimmed">
                  Loading...
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
          {rtDetail?.criteria.map((c) => {
            const cKey = `${rtKey}:${c.criteria}`;
            return (
              <CriteriaRow
                key={cKey}
                criteria={c}
                expanded={expandedCriteria.has(cKey)}
                onToggle={() => onToggleCriteria(cKey)}
              />
            );
          })}
        </>
      )}
    </Fragment>
  );
}

interface ProjectRowProps {
  readonly project: WsSubProjectStats;
  readonly expanded: boolean;
  readonly expandedResourceTypes: Set<string>;
  readonly expandedCriteria: Set<string>;
  readonly projectDetail?: WsSubResourceTypeDetailStats[];
  readonly isLoadingDetail: boolean;
  readonly onToggle: () => void;
  readonly onToggleResourceType: (projectId: string, resourceType: string) => void;
  readonly onToggleCriteria: (key: string) => void;
}

function ProjectRow({
  project,
  expanded,
  expandedResourceTypes,
  expandedCriteria,
  projectDetail,
  isLoadingDetail,
  onToggle,
  onToggleResourceType,
  onToggleCriteria,
}: ProjectRowProps): JSX.Element {
  return (
    <Fragment>
      <Table.Tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <Table.Td>
          <Group gap="xs">
            <Text size="xs">{expanded ? '▼' : '▶'}</Text>
            <ReferenceDisplay value={{ reference: `Project/${project.projectId}`, display: project.projectName }} />
          </Group>
        </Table.Td>
        <Table.Td>{project.subscriptionCount}</Table.Td>
      </Table.Tr>
      {expanded &&
        project.resourceTypes.map((rt) => {
          const rtKey = `${project.projectId}:${rt.resourceType}`;
          return (
            <ResourceTypeRow
              key={rtKey}
              projectId={project.projectId}
              rt={rt}
              rtDetail={projectDetail?.find((d) => d.resourceType === rt.resourceType)}
              isLoading={isLoadingDetail}
              expanded={expandedResourceTypes.has(rtKey)}
              expandedCriteria={expandedCriteria}
              onToggle={() => onToggleResourceType(project.projectId, rt.resourceType)}
              onToggleCriteria={onToggleCriteria}
            />
          );
        })}
    </Fragment>
  );
}

export function WsSubStatsWidget(): JSX.Element {
  const medplum = useMedplum();
  const [projects, setProjects] = useState<WsSubProjectStats[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [opened, { open, close }] = useDisclosure(false);
  const [expandedProjects, setExpandedProjects] = useState(new Set<string>());
  const [expandedResourceTypes, setExpandedResourceTypes] = useState(new Set<string>());
  const [expandedCriteria, setExpandedCriteria] = useState(new Set<string>());
  // Cache of per-project detail stats (resource types + criteria), keyed by projectId
  const [projectDetails, setProjectDetails] = useState(new Map<string, WsSubResourceTypeDetailStats[]>());
  // Per-project loading state, keyed by projectId
  const [loadingProjectDetails, setLoadingProjectDetails] = useState(new Map<string, boolean>());

  function fetchStats(): void {
    setLoading(true);
    medplum
      .get<Parameters>('fhir/R4/$get-ws-sub-stats', { cache: 'no-cache' })
      .then((params) => {
        const statsStr = params.parameter?.find((p) => p.name === 'stats')?.valueString;
        if (statsStr) {
          const parsed = JSON.parse(statsStr) as { projects: WsSubProjectStats[] };
          setProjects(parsed.projects);
        }
        open();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setLoading(false));
  }

  function toggleResourceType(projectId: string, resourceType: string): void {
    const key = `${projectId}:${resourceType}`;
    if (!projectDetails.has(projectId)) {
      setLoadingProjectDetails((prev) => new Map(prev).set(projectId, true));
      medplum
        .get<Parameters>(`fhir/R4/$get-ws-sub-project-stats?projectId=${encodeURIComponent(projectId)}`, {
          cache: 'no-cache',
        })
        .then((params) => {
          const statsStr = params.parameter?.find((p) => p.name === 'stats')?.valueString;
          if (statsStr) {
            const parsed = JSON.parse(statsStr) as { projectId: string; resourceTypes: WsSubResourceTypeDetailStats[] };
            setProjectDetails((prev) => new Map(prev).set(projectId, parsed.resourceTypes));
          }
        })
        .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
        .finally(() =>
          setLoadingProjectDetails((prev) => {
            const next = new Map(prev);
            next.delete(projectId);
            return next;
          })
        );
    }
    setExpandedResourceTypes((prev) => toggleSetEntry(prev, key));
  }

  return (
    <>
      <Button onClick={fetchStats} loading={loading}>
        Get WS Sub Stats
      </Button>
      <Modal opened={opened} onClose={close} title="WebSocket Subscription Stats" size="xl" centered>
        {!projects?.length && <Text>No active WebSocket subscriptions found.</Text>}
        {projects && projects.length > 0 && (
          <Table striped highlightOnHover withTableBorder withColumnBorders tabularNums>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Project / Resource Type / Criteria</Table.Th>
                <Table.Th>Count</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {projects.map((project) => (
                <ProjectRow
                  key={project.projectId}
                  project={project}
                  expanded={expandedProjects.has(project.projectId)}
                  expandedResourceTypes={expandedResourceTypes}
                  expandedCriteria={expandedCriteria}
                  projectDetail={projectDetails.get(project.projectId)}
                  isLoadingDetail={loadingProjectDetails.get(project.projectId) === true}
                  onToggle={() => setExpandedProjects((prev) => toggleSetEntry(prev, project.projectId))}
                  onToggleResourceType={toggleResourceType}
                  onToggleCriteria={(key) => setExpandedCriteria((prev) => toggleSetEntry(prev, key))}
                />
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Modal>
    </>
  );
}
