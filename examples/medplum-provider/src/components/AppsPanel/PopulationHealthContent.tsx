// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconChartBar,
  IconDownload,
  IconFilter,
  IconHeartbeat,
  IconRefresh,
  IconSettings,
  IconTrendingUp,
  IconUsers,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useAppsPanel } from './AppsPanelContext';

const KPI_CARDS = [
  { label: 'Total Patients', value: '2,847', icon: IconUsers, color: 'blue', trend: '+3.2%' },
  { label: 'Open Care Gaps', value: '342', icon: IconAlertTriangle, color: 'orange', trend: '-12' },
  { label: 'Compliance Rate', value: '78.3%', icon: IconTrendingUp, color: 'green', trend: '+2.1%' },
  { label: 'Pending Outreach', value: '156', icon: IconHeartbeat, color: 'violet', trend: '23 new' },
];

const QUALITY_MEASURES = [
  { measure: 'Diabetes HbA1c Control', target: 85, actual: 78.2, patients: 412 },
  { measure: 'Breast Cancer Screening', target: 80, actual: 72.1, patients: 289 },
  { measure: 'Colorectal Cancer Screening', target: 75, actual: 68.5, patients: 534 },
  { measure: 'Well-Child Visits (3-6)', target: 90, actual: 84.3, patients: 178 },
  { measure: 'Controlling Blood Pressure', target: 80, actual: 75.8, patients: 623 },
];

const CARE_GAPS = [
  { patient: 'Johnson, Maria', gap: 'HbA1c overdue', priority: 'High', days: 45 },
  { patient: 'Chen, Robert', gap: 'Mammogram overdue', priority: 'Medium', days: 30 },
  { patient: 'Williams, Sarah', gap: 'Colorectal screening', priority: 'High', days: 60 },
  { patient: 'Patel, Amir', gap: 'Well-child visit', priority: 'Low', days: 15 },
];

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  trend,
}: {
  readonly label: string;
  readonly value: string;
  readonly icon: typeof IconUsers;
  readonly color: string;
  readonly trend: string;
}): JSX.Element {
  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" mb={4}>
        <ThemeIcon size={28} radius="md" color={color} variant="light">
          <Icon size={16} />
        </ThemeIcon>
        <Badge size="xs" variant="light" color={color}>
          {trend}
        </Badge>
      </Group>
      <Text size="xl" fw={700} lh={1.2}>
        {value}
      </Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Paper>
  );
}

function QualityMeasuresCard(): JSX.Element {
  return (
    <Card withBorder radius="md" p="md" style={{ flex: 1, minWidth: 0 }}>
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <ThemeIcon size={22} radius="sm" color="blue" variant="light">
            <IconChartBar size={13} />
          </ThemeIcon>
          <Text size="sm" fw={600}>
            Quality Measures
          </Text>
        </Group>
        <Badge size="xs" variant="light">
          HEDIS 2026
        </Badge>
      </Group>

      <Table horizontalSpacing="xs" verticalSpacing="sm" fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Measure</Table.Th>
            <Table.Th ta="right">Progress</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {QUALITY_MEASURES.map((row) => {
            const pct = Math.round((row.actual / row.target) * 100);
            let color = 'orange';
            if (pct >= 95) {
              color = 'green';
            } else if (pct >= 80) {
              color = 'blue';
            }
            return (
              <Table.Tr key={row.measure}>
                <Table.Td>
                  <Text size="xs" fw={500}>
                    {row.measure}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {row.patients} patients · Target {row.target}%
                  </Text>
                  <Progress size="xs" value={row.actual} color={color} mt={4} />
                </Table.Td>
                <Table.Td ta="right" style={{ verticalAlign: 'top' }}>
                  <Text size="sm" fw={600} c={color}>
                    {row.actual}%
                  </Text>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

function getPriorityColor(priority: string): string {
  if (priority === 'High') {
    return 'red';
  }
  if (priority === 'Medium') {
    return 'orange';
  }
  return 'gray';
}

function CareGapsCard(): JSX.Element {
  return (
    <Card withBorder radius="md" p="md" style={{ flex: 1, minWidth: 0 }}>
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <ThemeIcon size={22} radius="sm" color="orange" variant="light">
            <IconAlertTriangle size={13} />
          </ThemeIcon>
          <Text size="sm" fw={600}>
            Priority Care Gaps
          </Text>
        </Group>
        <Button variant="subtle" size="xs" c="blue">
          View All
        </Button>
      </Group>

      <Stack gap="xs">
        {CARE_GAPS.map((gap) => (
          <Paper key={gap.patient} withBorder p="xs" radius="sm">
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Text size="xs" fw={500}>
                  {gap.patient}
                </Text>
                <Text size="xs" c="dimmed">
                  {gap.gap} · {gap.days} days overdue
                </Text>
              </div>
              <Badge size="xs" variant="light" color={getPriorityColor(gap.priority)}>
                {gap.priority}
              </Badge>
            </Group>
          </Paper>
        ))}
      </Stack>
    </Card>
  );
}

export function PopulationHealthContent(): JSX.Element {
  const { panelMaximized } = useAppsPanel();

  return (
    <Box p="md" style={{ overflowY: 'auto', flex: 1 }}>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={5}>Population Health Overview</Title>
            <Text size="xs" c="dimmed">
              HEDIS & Quality Measures — Last refreshed 2 hours ago
            </Text>
          </div>
          <Group gap="xs">
            <Button variant="default" size="xs" leftSection={<IconFilter size={14} />}>
              Filter
            </Button>
            <Button variant="default" size="xs" leftSection={<IconRefresh size={14} />}>
              Refresh
            </Button>
          </Group>
        </Group>

        {/* KPI Cards */}
        <SimpleGrid cols={panelMaximized ? 4 : 2} spacing="sm">
          {KPI_CARDS.map((kpi) => (
            <KpiCard key={kpi.label} {...kpi} />
          ))}
        </SimpleGrid>

        <Divider />

        {/* Quality Measures + Care Gaps: side-by-side when expanded */}
        {panelMaximized ? (
          <Group gap="md" align="flex-start" wrap="nowrap">
            <QualityMeasuresCard />
            <CareGapsCard />
          </Group>
        ) : (
          <>
            <QualityMeasuresCard />
            <CareGapsCard />
          </>
        )}

        {/* Action Buttons */}
        <Group gap="xs">
          <Button variant="default" size="xs" leftSection={<IconDownload size={14} />}>
            Export Report
          </Button>
          <Button variant="default" size="xs" leftSection={<IconChartBar size={14} />}>
            Custom Dashboard
          </Button>
          <Button variant="default" size="xs" leftSection={<IconSettings size={14} />}>
            Settings
          </Button>
        </Group>
      </Stack>
    </Box>
  );
}
