// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { ReferenceDisplay } from '@medplum/react';
import { IconRefresh, IconShieldCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { AdminEntry, ClientEntry, SecurityFinding, SecuritySeverity } from './security/checks';
import { isAdminFinding, SECRET_MAX_AGE_DAYS, SEVERITY_ORDER } from './security/checks';
import { useSecurityCheckData } from './security/useSecurityCheckData';

const SEVERITY_COLORS: Record<SecuritySeverity, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'yellow',
  low: 'gray',
};

const SEVERITY_LABELS: Record<SecuritySeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function SecurityHealthCheckPage(): JSX.Element {
  const { loading, result, error, reload } = useSecurityCheckData();

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Security Health Check</Title>
        <Button
          variant="default"
          leftSection={<IconRefresh size={16} />}
          onClick={reload}
          loading={loading}
          disabled={loading}
        >
          Run again
        </Button>
      </Group>
      <Alert color="blue" title="Alpha">
        This feature is in alpha. Checks and recommendations may change, and new checks will be added over time.
      </Alert>
      <Text c="dimmed">
        Reviews this project's memberships, clients and access policies against Medplum's recommended security
        practices. Each finding explains the risk and how to address it, ranked from most to least severe. Some findings
        may be intentional for your project, so review each one and decide whether it applies.
      </Text>

      {error && (
        <Alert color="red" title="Security check failed">
          {error}
        </Alert>
      )}

      {loading && !result && (
        <Group justify="center" p="xl">
          <Loader />
        </Group>
      )}

      {result && (
        <Tabs defaultValue="findings" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="findings">Findings ({result.findings.length})</Tabs.Tab>
            <Tabs.Tab value="clients">Clients ({result.clients.length})</Tabs.Tab>
            <Tabs.Tab value="admins">Admins ({result.admins.length})</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="findings" pt="md">
            <FindingsPanel findings={result.findings} />
          </Tabs.Panel>
          <Tabs.Panel value="clients" pt="md">
            <ClientsPanel clients={result.clients} />
          </Tabs.Panel>
          <Tabs.Panel value="admins" pt="md">
            <AdminsPanel admins={result.admins} findings={result.findings} />
          </Tabs.Panel>
        </Tabs>
      )}

      <Text size="xs" c="dimmed">
        Checks for single sign-on availability and IP restrictions based on client login history are coming soon.
      </Text>
    </Stack>
  );
}

interface FindingsPanelProps {
  readonly findings: SecurityFinding[];
}

function FindingsPanel({ findings }: FindingsPanelProps): JSX.Element {
  const [filter, setFilter] = useState<'all' | SecuritySeverity>('all');

  const counts = useMemo(() => {
    const result: Record<SecuritySeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const finding of findings) {
      result[finding.severity]++;
    }
    return result;
  }, [findings]);

  const visible = useMemo(
    () => (filter === 'all' ? findings : findings.filter((f) => f.severity === filter)),
    [findings, filter]
  );

  if (findings.length === 0) {
    return (
      <Alert color="green" icon={<IconShieldCheck />} title="No issues found">
        No security issues were detected in this project's configuration.
      </Alert>
    );
  }

  return (
    <Stack>
      <SegmentedControl
        value={filter}
        onChange={(value) => setFilter(value as 'all' | SecuritySeverity)}
        data={[
          { label: `All (${findings.length})`, value: 'all' },
          ...SEVERITY_ORDER.map((severity) => ({
            label: `${SEVERITY_LABELS[severity]} (${counts[severity]})`,
            value: severity,
          })),
        ]}
      />
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Severity</Table.Th>
            <Table.Th>Finding</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {visible.map((finding) => (
            <Table.Tr key={finding.id}>
              <Table.Td valign="top">
                <Badge color={SEVERITY_COLORS[finding.severity]}>{SEVERITY_LABELS[finding.severity]}</Badge>
              </Table.Td>
              <Table.Td>
                <Text fw={500}>{finding.title}</Text>
                <Text size="sm" c="dimmed">
                  {finding.description}
                </Text>
              </Table.Td>
              <Table.Td valign="top">
                {finding.link && (
                  <Anchor component={Link} to={finding.link} size="sm">
                    View
                  </Anchor>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

/**
 * Props for the Admins tab.
 * - `findings` are all findings; the admin-related ones are shown as alerts above the table.
 */
interface AdminsPanelProps {
  readonly admins: AdminEntry[];
  readonly findings: SecurityFinding[];
}

function AdminsPanel({ admins, findings }: AdminsPanelProps): JSX.Element {
  const warnings = useMemo(() => findings.filter(isAdminFinding), [findings]);

  if (admins.length === 0) {
    return <Text c="dimmed">No members have admin privileges.</Text>;
  }

  return (
    <Stack>
      {warnings.map((warning) => (
        <Alert key={warning.id} color={SEVERITY_COLORS[warning.severity]} title={warning.title}>
          {warning.description}
        </Alert>
      ))}
      <Text size="sm" c="dimmed">
        Admins can manage memberships, access policies, bots and project settings. Remove admin from any member that
        does not need it.
      </Text>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Access policy</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {admins.map((admin) => (
            <Table.Tr key={admin.membershipId}>
              <Table.Td>
                <Group gap="xs">
                  <Anchor component={Link} to={admin.link}>
                    {admin.name}
                  </Anchor>
                  {admin.isOwner && <Badge variant="light">Owner</Badge>}
                  {!admin.active && (
                    <Badge variant="light" color="gray">
                      Inactive
                    </Badge>
                  )}
                </Group>
              </Table.Td>
              <Table.Td>{admin.profileType}</Table.Td>
              <Table.Td>
                {admin.accessPolicies.length === 0 ? (
                  <Text c="dimmed">None</Text>
                ) : (
                  <Stack gap={0}>
                    {admin.accessPolicies.map((policy) => (
                      <ReferenceDisplay key={policy.reference} value={policy} link />
                    ))}
                  </Stack>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

interface ClientsPanelProps {
  readonly clients: ClientEntry[];
}

function ClientsPanel({ clients }: ClientsPanelProps): JSX.Element {
  if (clients.length === 0) {
    return <Text c="dimmed">This project has no client applications.</Text>;
  }

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Client applications should have an access policy with IP restrictions, should not be able to write Bots, and
        should rotate their secret at least every {SECRET_MAX_AGE_DAYS} days.
      </Text>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Access policy</Table.Th>
            <Table.Th>IP restricted</Table.Th>
            <Table.Th>Can write Bots</Table.Th>
            <Table.Th>Admin</Table.Th>
            <Table.Th>Secret age</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {clients.map((client) => (
            <Table.Tr key={client.membershipId}>
              <Table.Td>
                <Group gap="xs">
                  <Anchor component={Link} to={client.link}>
                    {client.name}
                  </Anchor>
                  {!client.active && (
                    <Badge variant="light" color="gray">
                      Inactive
                    </Badge>
                  )}
                </Group>
              </Table.Td>
              <Table.Td>
                {client.hasPolicy ? (
                  <Stack gap={0}>
                    {client.accessPolicies.map((policy) => (
                      <ReferenceDisplay key={policy.reference} value={policy} link />
                    ))}
                  </Stack>
                ) : (
                  <Badge color="red">None</Badge>
                )}
              </Table.Td>
              <Table.Td>
                {client.policiesResolved ? (
                  <YesNoBadge value={client.ipRestricted} good={true} />
                ) : (
                  <Text c="dimmed">Unknown</Text>
                )}
              </Table.Td>
              <Table.Td>
                {client.policiesResolved || client.canWriteBots ? (
                  <YesNoBadge value={client.canWriteBots} good={false} />
                ) : (
                  <Text c="dimmed">Unknown</Text>
                )}
              </Table.Td>
              <Table.Td>
                <YesNoBadge value={client.admin} good={false} />
              </Table.Td>
              <Table.Td>
                {client.secretAgeDays === undefined ? (
                  <Text c="dimmed">Unknown</Text>
                ) : (
                  <Text c={client.secretAgeDays > SECRET_MAX_AGE_DAYS ? 'red' : undefined}>
                    {client.secretAgeIsLowerBound ? 'At least ' : ''}
                    {client.secretAgeDays} days
                  </Text>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

interface YesNoBadgeProps {
  readonly value: boolean;
  readonly good: boolean;
}

/**
 * Yes/No badge colored green when the value is the safe one and red otherwise.
 * @param props - The value and which value is the safe one.
 * @returns The badge.
 */
function YesNoBadge(props: YesNoBadgeProps): JSX.Element {
  return (
    <Badge variant="light" color={props.value === props.good ? 'green' : 'red'}>
      {props.value ? 'Yes' : 'No'}
    </Badge>
  );
}
