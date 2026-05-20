// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Group, Stack, Tabs, Text, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { Document } from '../Document/Document';
import { ListDetailLayout } from './ListDetailLayout';
import { ListEmptyState } from './ListEmptyState';
import { ListItem } from './ListItem';
import { ListPagination } from './ListPagination';
import { ListScrollArea } from './ListScrollArea';
import { ListShell } from './ListShell';
import { ListSkeleton } from './ListSkeleton';
import { listClasses } from './listClasses';

export default {
  title: 'Medplum/List',
  component: ListShell,
} as Meta;

const SAMPLE_ITEMS = [
  { id: '1', title: 'John Smith', subtitle: 'Appointment follow-up', date: 'May 10, 2026' },
  { id: '2', title: 'Jane Doe', subtitle: 'Lab results review', date: 'May 9, 2026' },
  { id: '3', title: 'Bob Johnson', subtitle: 'Prescription renewal', date: 'May 8, 2026' },
  { id: '4', title: 'Alice Williams', subtitle: 'Referral request', date: 'May 7, 2026' },
  { id: '5', title: 'Charlie Brown', subtitle: 'Annual checkup', date: 'May 6, 2026' },
];

// Row spacing convention: wrap list rows in `<Stack gap={2}>`. We intentionally
// do not bake row gap into `ListItem` so callers can opt into tighter or
// looser densities (e.g. `gap="xs"`) when their items need more breathing room.
const ROW_GAP = 2;

export const SelectableRows = (): JSX.Element => {
  const [selectedId, setSelectedId] = useState('1');
  return (
    <Document>
      <div style={{ height: 500, display: 'flex' }}>
        <ListShell
          header={<Text className={listClasses.headerText}>Patients</Text>}
        >
          <ListScrollArea>
            <Stack gap={ROW_GAP}>
              {SAMPLE_ITEMS.map((item) => (
                <ListItem
                  key={item.id}
                  to={`/Patient/${item.id}`}
                  selected={selectedId === item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <Stack gap={0}>
                    <Text size="sm" fw={700} truncate="end">
                      {item.title}
                    </Text>
                    <Text size="sm" c="dimmed" truncate="end">
                      {item.subtitle}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {item.date}
                    </Text>
                  </Stack>
                </ListItem>
              ))}
            </Stack>
          </ListScrollArea>
        </ListShell>
      </div>
    </Document>
  );
};

export const WithHeaderTabs = (): JSX.Element => {
  const [tab, setTab] = useState<string | null>('inbox');
  const [selectedId, setSelectedId] = useState('1');
  return (
    <Document>
      <div style={{ height: 500, display: 'flex' }}>
        <ListShell
          header={
            <>
              <Tabs value={tab} onChange={setTab} variant="unstyled" className={listClasses.pillTabs}>
                <Tabs.List>
                  <Tabs.Tab value="inbox">Inbox</Tabs.Tab>
                  <Tabs.Tab value="sent">Sent</Tabs.Tab>
                </Tabs.List>
              </Tabs>
              <Group gap="xs">
                <Tooltip label="New" position="bottom" openDelay={500}>
                  <ActionIcon radius="xl" variant="filled" color="blue" size={32}>
                    <IconPlus size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </>
          }
        >
          <ListScrollArea>
            <Stack gap={ROW_GAP}>
              {SAMPLE_ITEMS.map((item) => (
                <ListItem
                  key={item.id}
                  to={`/Task/${item.id}`}
                  selected={selectedId === item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="sm" fw={700} truncate="end">
                      {item.title}
                    </Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {item.subtitle}
                  </Text>
                </ListItem>
              ))}
            </Stack>
          </ListScrollArea>
        </ListShell>
      </div>
    </Document>
  );
};

export const WithPagination = (): JSX.Element => {
  const [offset, setOffset] = useState(0);
  return (
    <Document>
      <div style={{ height: 500, display: 'flex' }}>
        <ListShell
          header={<Text className={listClasses.headerText}>Tasks</Text>}
          footer={<ListPagination total={100} offset={offset} pageSize={20} onOffsetChange={setOffset} />}
        >
          <ListScrollArea>
            <Stack gap={ROW_GAP}>
              {SAMPLE_ITEMS.map((item) => (
                <ListItem key={item.id} to={`/Task/${item.id}`}>
                  <Text size="sm" fw={700}>
                    {item.title}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {item.subtitle}
                  </Text>
                </ListItem>
              ))}
            </Stack>
          </ListScrollArea>
        </ListShell>
      </div>
    </Document>
  );
};

export const Loading = (): JSX.Element => (
  <Document>
    <div style={{ height: 500, display: 'flex' }}>
      <ListShell header={<Text className={listClasses.headerText}>Loading...</Text>}>
        <ListScrollArea>
          <ListSkeleton />
        </ListScrollArea>
      </ListShell>
    </div>
  </Document>
);

export const LoadingWithAvatar = (): JSX.Element => (
  <Document>
    <div style={{ height: 500, display: 'flex' }}>
      <ListShell header={<Text className={listClasses.headerText}>Loading with Avatar…</Text>}>
        <ListScrollArea>
          <ListSkeleton withAvatar linesPerRow={2} />
        </ListScrollArea>
      </ListShell>
    </div>
  </Document>
);

export const Empty = (): JSX.Element => (
  <Document>
    <div style={{ height: 500, display: 'flex' }}>
      <ListShell header={<Text className={listClasses.headerText}>Empty</Text>}>
        <ListScrollArea>
          <ListEmptyState message="No items available." />
        </ListScrollArea>
      </ListShell>
    </div>
  </Document>
);

export const FullLayout = (): JSX.Element => {
  const [selectedId, setSelectedId] = useState<string | undefined>('1');
  const selected = SAMPLE_ITEMS.find((i) => i.id === selectedId);
  return (
    <Document>
      <div style={{ height: 500, display: 'flex' }}>
        <ListDetailLayout>
          <ListShell header={<Text className={listClasses.headerText}>Patients</Text>}>
            <ListScrollArea>
              <Stack gap={ROW_GAP}>
                {SAMPLE_ITEMS.map((item) => (
                  <ListItem
                    key={item.id}
                    selected={selectedId === item.id}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <Text size="sm" fw={700}>
                      {item.title}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {item.subtitle}
                    </Text>
                  </ListItem>
                ))}
              </Stack>
            </ListScrollArea>
          </ListShell>
          <ListDetailLayout.Column>
            {selected ? (
              <Stack p="md">
                <Text fw={700} size="lg">
                  {selected.title}
                </Text>
                <Text c="dimmed">{selected.subtitle}</Text>
                <Text size="sm">Detail content goes here.</Text>
              </Stack>
            ) : (
              <ListEmptyState message="Select a patient to view details." />
            )}
          </ListDetailLayout.Column>
        </ListDetailLayout>
      </div>
    </Document>
  );
};
