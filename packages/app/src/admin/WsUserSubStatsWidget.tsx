// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Checkbox, Group, Modal, Stack, Table, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Parameters, Patient, Practitioner, Project, Reference } from '@medplum/fhirtypes';
import { FormSection, ReferenceInput, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { Fragment, useMemo, useState } from 'react';

interface WsSubRef {
  ref: string;
  active: boolean;
}

interface WsUserSubCriteriaGroup {
  criteria: string;
  count: number;
  refs: WsSubRef[];
}

interface WsUserSubStats {
  userRef: string;
  totalCount: number;
  criteriaGroups: WsUserSubCriteriaGroup[];
}

export function WsUserSubStatsWidget(): JSX.Element {
  const medplum = useMedplum();
  const [project, setProject] = useState<Reference<Project> | undefined>();
  const [profile, setProfile] = useState<Reference<Practitioner | Patient> | undefined>();
  const [stats, setStats] = useState<WsUserSubStats | undefined>();
  const [removeFromActive, setRemoveFromActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [opened, { open, close }] = useDisclosure(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [expandedCriteria, setExpandedCriteria] = useState<Set<string>>(new Set());

  const profileSearchCriteria = useMemo<Record<string, string> | undefined>(() => {
    if (!project?.reference) {
      return undefined;
    }
    return { '_has:ProjectMembership:profile:project': project.reference };
  }, [project]);

  function fetchStats(): void {
    if (!profile?.reference) {
      showNotification({ color: 'red', message: 'Select a profile first', autoClose: false });
      return;
    }
    setLoading(true);
    medplum
      .post<Parameters>('fhir/R4/$get-user-ws-stats', {
        resourceType: 'Parameters',
        parameter: [{ name: 'userRef', valueReference: profile }],
      })
      .then((params) => {
        const statsStr = params.parameter?.find((p) => p.name === 'stats')?.valueString;
        if (statsStr) {
          setStats(JSON.parse(statsStr) as WsUserSubStats);
        }
        setConfirmClear(false);
        setExpandedCriteria(new Set());
        open();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setLoading(false));
  }

  function handleModalClose(): void {
    close();
    setConfirmClear(false);
    setRemoveFromActive(false);
  }

  function toggleCriteria(criteria: string): void {
    setExpandedCriteria((prev) => {
      const next = new Set(prev);
      if (next.has(criteria)) {
        next.delete(criteria);
      } else {
        next.add(criteria);
      }
      return next;
    });
  }

  function executeClear(): void {
    if (!profile?.reference) {
      return;
    }
    setClearLoading(true);
    medplum
      .post('fhir/R4/$clearuserwssubs', {
        resourceType: 'Parameters',
        parameter: [
          { name: 'userRef', valueReference: profile },
          ...(removeFromActive ? [{ name: 'removeFromActive', valueBoolean: true }] : []),
        ],
      })
      .then(() => {
        showNotification({ color: 'green', message: 'User WebSocket subscriptions cleared' });
        close();
        setConfirmClear(false);
        setStats(undefined);
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setClearLoading(false));
  }

  return (
    <>
      <Stack gap="sm">
        <FormSection title="Project (optional)" htmlFor="userWsProject">
          <ReferenceInput<Project>
            name="userWsProject"
            placeholder="All projects"
            targetTypes={['Project']}
            onChange={setProject}
          />
        </FormSection>
        <FormSection title="Profile" htmlFor="userWsProfile">
          <ReferenceInput<Practitioner | Patient>
            name="userWsProfile"
            placeholder="Practitioner or Patient"
            targetTypes={['Practitioner', 'Patient']}
            searchCriteria={profileSearchCriteria}
            onChange={setProfile}
          />
        </FormSection>
        <div>
          <Button onClick={fetchStats} loading={loading} disabled={!profile?.reference}>
            Get User WS Stats
          </Button>
        </div>
      </Stack>

      <Modal
        opened={opened}
        onClose={handleModalClose}
        title={`User WS Subscriptions: ${profile?.display ?? profile?.reference ?? ''}`}
        size="xl"
        centered
      >
        <Stack>
          {stats?.totalCount === 0 && <Text>No active WebSocket subscriptions found for this user.</Text>}
          {stats && stats.totalCount > 0 && (
            <Table striped highlightOnHover withTableBorder withColumnBorders tabularNums>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Criteria</Table.Th>
                  <Table.Th>Count</Table.Th>
                  <Table.Th>In project active list?</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {stats.criteriaGroups.map((group) => (
                  <Fragment key={group.criteria}>
                    <Table.Tr onClick={() => toggleCriteria(group.criteria)} style={{ cursor: 'pointer' }}>
                      <Table.Td>
                        <Group gap="xs">
                          <Text size="xs">{expandedCriteria.has(group.criteria) ? '▼' : '▶'}</Text>
                          <Text
                            fw={group.criteria === 'Stale' ? 700 : undefined}
                            c={group.criteria === 'Stale' ? 'orange' : undefined}
                          >
                            {group.criteria !== 'Stale' ? group.criteria : 'Cache entry expired'}
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>{group.count}</Table.Td>
                      <Table.Td />
                    </Table.Tr>
                    {expandedCriteria.has(group.criteria) &&
                      group.refs.map(({ ref, active }) => (
                        <Table.Tr key={ref}>
                          <Table.Td>
                            <Text pl="xl" size="sm" c="dimmed">
                              {ref}
                            </Text>
                          </Table.Td>
                          <Table.Td />
                          <Table.Td>
                            <Text size="sm" c={active ? 'green' : 'red'}>
                              {active ? 'Yes' : 'No'}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                  </Fragment>
                ))}
              </Table.Tbody>
            </Table>
          )}

          {!confirmClear && (
            <Group>
              <Button color="red" variant="outline" onClick={() => setConfirmClear(true)}>
                Clear All User Subscriptions
              </Button>
            </Group>
          )}

          {confirmClear && (
            <Stack gap="xs">
              <Text>
                Are you sure you want to clear all WebSocket subscriptions for{' '}
                <strong>{profile?.display ?? profile?.reference}</strong>?
              </Text>
              <Checkbox
                label="Also remove from project active list (clients will need to rebind)"
                checked={removeFromActive}
                onChange={(e) => setRemoveFromActive(e.currentTarget.checked)}
              />
              <Group>
                <Button color="red" onClick={executeClear} loading={clearLoading}>
                  Clear
                </Button>
                <Button variant="subtle" onClick={() => setConfirmClear(false)}>
                  Cancel
                </Button>
              </Group>
            </Stack>
          )}
        </Stack>
      </Modal>
    </>
  );
}
