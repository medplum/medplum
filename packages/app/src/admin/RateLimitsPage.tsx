// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Progress, Table, Text, Title, UnstyledButton } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Parameters, ParametersParameter, Reference } from '@medplum/fhirtypes';
import { ResourceName, useMedplum } from '@medplum/react';
import { IconArrowDown, IconArrowUp, IconRefresh } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getProjectId } from '../utils';

interface QuotaInfo {
  limit?: number;
  consumedPoints?: number;
  remainingPoints?: number;
  msBeforeReset?: number;
}

interface ProjectQuota extends QuotaInfo {
  id: string;
}

interface MembershipQuota extends QuotaInfo {
  membershipId: string;
  profile?: Reference;
}

interface RateLimitsData {
  project: ProjectQuota;
  memberships: MembershipQuota[];
}

function getPartValue(parts: ParametersParameter[] | undefined, name: string): string | undefined {
  return parts?.find((p) => p.name === name)?.valueString;
}

function getPartInteger(parts: ParametersParameter[] | undefined, name: string): number | undefined {
  return parts?.find((p) => p.name === name)?.valueInteger;
}

function getPartReference(parts: ParametersParameter[] | undefined, name: string): Reference | undefined {
  return parts?.find((p) => p.name === name)?.valueReference;
}

function parseRateLimitsResponse(params: Parameters): RateLimitsData {
  const projectParam = params.parameter?.find((p) => p.name === 'project');
  const project: ProjectQuota = {
    id: getPartValue(projectParam?.part, 'id') ?? '',
    limit: getPartInteger(projectParam?.part, 'limit'),
    consumedPoints: getPartInteger(projectParam?.part, 'consumedPoints'),
    remainingPoints: getPartInteger(projectParam?.part, 'remainingPoints'),
    msBeforeReset: getPartInteger(projectParam?.part, 'msBeforeReset'),
  };

  const membershipParams = params.parameter?.filter((p) => p.name === 'membership') ?? [];
  const memberships: MembershipQuota[] = membershipParams.map((m) => ({
    membershipId: getPartValue(m.part, 'membershipId') ?? '',
    profile: getPartReference(m.part, 'profile'),
    limit: getPartInteger(m.part, 'limit'),
    consumedPoints: getPartInteger(m.part, 'consumedPoints'),
    remainingPoints: getPartInteger(m.part, 'remainingPoints'),
    msBeforeReset: getPartInteger(m.part, 'msBeforeReset'),
  }));

  return { project, memberships };
}

function getUtilization(quota: QuotaInfo): number | undefined {
  if (quota.limit === undefined || quota.consumedPoints === undefined) {
    return undefined;
  }
  if (quota.limit === 0) {
    return 0;
  }
  return (quota.consumedPoints / quota.limit) * 100;
}

function getUtilizationColor(pct: number): string {
  if (pct >= 90) {
    return 'red';
  }
  if (pct >= 70) {
    return 'yellow';
  }
  return 'green';
}

function formatResetTime(ms: number | undefined): string {
  if (ms === undefined) {
    return '--';
  }
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatNumber(value: number | undefined): string {
  if (value === undefined) {
    return '--';
  }
  return value.toLocaleString();
}

function formatUtilization(quota: QuotaInfo): string {
  const pct = getUtilization(quota);
  if (pct === undefined) {
    return '--';
  }
  return `${pct.toFixed(1)}%`;
}

type SortDirection = 'asc' | 'desc';

export function RateLimitsPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const [data, setData] = useState<RateLimitsData | undefined>();
  const [loading, setLoading] = useState(false);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleRefresh = useCallback((): void => {
    setLoading(true);
    medplum
      .get(medplum.fhirUrl('Project', projectId, '$rate-limits'), { cache: 'no-cache' })
      .then((params: Parameters) => {
        setData(parseRateLimitsResponse(params));
      })
      .catch((err: unknown) => {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [medplum, projectId]);

  const toggleSort = useCallback((): void => {
    setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  }, []);

  const sortedMemberships = useMemo(() => {
    if (!data) {
      return [];
    }
    return [...data.memberships].sort((a, b) => {
      const aUtil = getUtilization(a) ?? -1;
      const bUtil = getUtilization(b) ?? -1;
      return sortDirection === 'desc' ? bUtil - aUtil : aUtil - bUtil;
    });
  }, [data, sortDirection]);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title>Rate Limits</Title>
        <Button leftSection={<IconRefresh size={14} />} loading={loading} onClick={handleRefresh}>
          Refresh
        </Button>
      </Group>

      {!data && !loading && <Text c="dimmed">Click Refresh to load current rate limit data.</Text>}

      {data && (
        <>
          <ProjectSummary project={data.project} />
          {sortedMemberships.length === 0 ? (
            <Text c="dimmed" mt="md">
              No membership rate limit data found.
            </Text>
          ) : (
            <MembershipTable memberships={sortedMemberships} sortDirection={sortDirection} onToggleSort={toggleSort} />
          )}
        </>
      )}
    </>
  );
}

function ProjectSummary({ project }: { readonly project: ProjectQuota }): JSX.Element {
  const utilization = getUtilization(project);
  const hasData = utilization !== undefined;

  return (
    <div style={{ marginBottom: '1rem' }}>
      <Title order={4} mb="xs">
        Project Utilization
      </Title>
      {hasData ? (
        <>
          <Group gap="xl" mb="xs">
            <Text size="sm">
              <strong>Consumed:</strong> {formatNumber(project.consumedPoints)} / {formatNumber(project.limit)}
            </Text>
            <Text size="sm">
              <strong>Remaining:</strong> {formatNumber(project.remainingPoints)}
            </Text>
            <Text size="sm">
              <strong>Utilization:</strong> {formatUtilization(project)}
            </Text>
            <Text size="sm">
              <strong>Resets in:</strong> {formatResetTime(project.msBeforeReset)}
            </Text>
          </Group>
          <Progress value={utilization} color={getUtilizationColor(utilization)} size="lg" />
        </>
      ) : (
        <Text c="dimmed" size="sm">
          No project-level rate limit data recorded yet.
        </Text>
      )}
    </div>
  );
}

interface MembershipTableProps {
  readonly memberships: MembershipQuota[];
  readonly sortDirection: SortDirection;
  readonly onToggleSort: () => void;
}

function MembershipTable({ memberships, sortDirection, onToggleSort }: MembershipTableProps): JSX.Element {
  return (
    <>
      <Title order={4} mt="lg" mb="xs">
        Membership Utilization
      </Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Membership ID</Table.Th>
            <Table.Th>Profile</Table.Th>
            <Table.Th>Limit</Table.Th>
            <Table.Th>Consumed</Table.Th>
            <Table.Th>Remaining</Table.Th>
            <Table.Th>
              <UnstyledButton
                onClick={onToggleSort}
                style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                Utilization
                {sortDirection === 'desc' ? <IconArrowDown size={14} /> : <IconArrowUp size={14} />}
              </UnstyledButton>
            </Table.Th>
            <Table.Th>Resets In</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {memberships.map((m) => (
            <MembershipRow key={m.membershipId} membership={m} />
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}

function MembershipRow({ membership }: { readonly membership: MembershipQuota }): JSX.Element {
  const navigate = useNavigate();
  const utilization = getUtilization(membership);
  return (
    <Table.Tr onClick={() => navigate(`/admin/users/${membership.membershipId}`)} style={{ cursor: 'pointer' }}>
      <Table.Td>{membership.membershipId}</Table.Td>
      <Table.Td><ResourceName value={membership.profile} /></Table.Td>
      <Table.Td>{formatNumber(membership.limit)}</Table.Td>
      <Table.Td>{formatNumber(membership.consumedPoints)}</Table.Td>
      <Table.Td>{formatNumber(membership.remainingPoints)}</Table.Td>
      <Table.Td>
        {utilization !== undefined ? (
          <Group gap="xs">
            <Progress
              value={utilization}
              color={getUtilizationColor(utilization)}
              size="sm"
              style={{ flex: 1, minWidth: 60 }}
            />
            <Text size="sm" w={50} ta="right">
              {utilization.toFixed(1)}%
            </Text>
          </Group>
        ) : (
          '--'
        )}
      </Table.Td>
      <Table.Td>{formatResetTime(membership.msBeforeReset)}</Table.Td>
    </Table.Tr>
  );
}
