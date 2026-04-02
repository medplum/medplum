// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Modal, Table, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { ReferenceDisplay, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { Fragment, useState } from 'react';

interface WsSubCriteriaStats {
  criteria: string;
  count: number;
}

interface WsSubResourceTypeStats {
  resourceType: string;
  count: number;
}

interface WsSubResourceTypeDetailStats {
  resourceType: string;
  count: number;
  criteria: WsSubCriteriaStats[];
}

interface WsSubProjectStats {
  projectId: string;
  projectName?: string;
  subscriptionCount: number;
  resourceTypes: WsSubResourceTypeStats[];
}

export function WsSubStatsWidget(): JSX.Element {
  const medplum = useMedplum();
  const [projects, setProjects] = useState<WsSubProjectStats[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [opened, { open, close }] = useDisclosure(false);
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const [expandedResourceTypes, setExpandedResourceTypes] = useState(new Set());
  // Cache of per-project detail stats (resource types + criteria), keyed by projectId
  const [projectDetails, setProjectDetails] = useState(new Map<string, WsSubResourceTypeDetailStats[]>());
  // Per-project loading state, keyed by projectId
  const [loadingProjectDetails, setLoadingProjectDetails] = useState(new Map<string, boolean>());

  function fetchStats(): void {
    setLoading(true);
    medplum
      .get<Parameters>('fhir/R4/$get-ws-sub-stats')
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

  function toggleProject(projectId: string): void {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }

  function toggleResourceType(projectId: string, resourceType: string): void {
    const key = `${projectId}:${resourceType}`;
    // Lazy-load criteria for this project if not already fetched
    if (!projectDetails.has(projectId)) {
      setLoadingProjectDetails((prev) => new Map(prev).set(projectId, true));
      medplum
        .get<Parameters>(`fhir/R4/$get-ws-sub-project-stats?projectId=${encodeURIComponent(projectId)}`)
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
    setExpandedResourceTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
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
                <Fragment key={project.projectId}>
                  <Table.Tr onClick={() => toggleProject(project.projectId)} style={{ cursor: 'pointer' }}>
                    <Table.Td>
                      <Group gap="xs">
                        <Text size="xs">{expandedProjects.has(project.projectId) ? '▼' : '▶'}</Text>
                        <ReferenceDisplay
                          value={{ reference: `Project/${project.projectId}`, display: project.projectName }}
                        />
                      </Group>
                    </Table.Td>
                    <Table.Td>{project.subscriptionCount}</Table.Td>
                  </Table.Tr>
                  {expandedProjects.has(project.projectId) &&
                    project.resourceTypes.map((rt) => {
                      const rtKey = `${project.projectId}:${rt.resourceType}`;
                      const detail = projectDetails.get(project.projectId);
                      const rtDetail = detail?.find((d) => d.resourceType === rt.resourceType);
                      const isLoadingThis = loadingProjectDetails.get(project.projectId) === true;
                      return (
                        <Fragment key={rtKey}>
                          <Table.Tr
                            onClick={() => toggleResourceType(project.projectId, rt.resourceType)}
                            style={{ cursor: 'pointer' }}
                          >
                            <Table.Td>
                              <Group gap="xs" pl="md">
                                <Text size="xs">{expandedResourceTypes.has(rtKey) ? '▼' : '▶'}</Text>
                                <Text>{rt.resourceType}</Text>
                              </Group>
                            </Table.Td>
                            <Table.Td>{rt.count}</Table.Td>
                          </Table.Tr>
                          {expandedResourceTypes.has(rtKey) && (
                            <>
                              {isLoadingThis && !rtDetail && (
                                <Table.Tr>
                                  <Table.Td colSpan={2}>
                                    <Text pl="xl" size="sm" c="dimmed">
                                      Loading...
                                    </Text>
                                  </Table.Td>
                                </Table.Tr>
                              )}
                              {rtDetail?.criteria.map((c) => (
                                <Table.Tr key={`${rtKey}:${c.criteria}`}>
                                  <Table.Td>
                                    <Text pl="xl" size="sm" c="dimmed">
                                      {c.criteria}
                                    </Text>
                                  </Table.Td>
                                  <Table.Td>{c.count}</Table.Td>
                                </Table.Tr>
                              ))}
                            </>
                          )}
                        </Fragment>
                      );
                    })}
                </Fragment>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Modal>
    </>
  );
}
