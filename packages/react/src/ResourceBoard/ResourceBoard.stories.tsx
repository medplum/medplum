// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Paper, Text, Tooltip } from '@mantine/core';
import type { Communication } from '@medplum/fhirtypes';
import { IconPlus } from '@tabler/icons-react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { Document } from '../Document/Document';
import { ResourceBoard } from './ResourceBoard';

export default {
  title: 'Medplum/ResourceBoard',
  component: ResourceBoard,
} as Meta;

const sampleItems: Communication[] = [
  {
    resourceType: 'Communication',
    id: 'comm-1',
    status: 'in-progress',
    topic: { text: 'Lab results follow-up' },
    payload: [{ contentString: 'Please review the latest lab results.' }],
  },
  {
    resourceType: 'Communication',
    id: 'comm-2',
    status: 'in-progress',
    topic: { text: 'Medication refill request' },
    payload: [{ contentString: 'Refill request for lisinopril 10mg.' }],
  },
  {
    resourceType: 'Communication',
    id: 'comm-3',
    status: 'completed',
    topic: { text: 'Appointment reschedule' },
    payload: [{ contentString: 'Patient asked to move the visit to next week.' }],
  },
];

function ItemRow(props: { readonly item: Communication; readonly selected: boolean }): JSX.Element {
  return (
    <Box
      p="sm"
      style={{
        cursor: 'pointer',
        background: props.selected ? 'var(--mantine-color-gray-1)' : undefined,
        borderBottom: '1px solid var(--mantine-color-gray-2)',
      }}
    >
      <Text fw={500} truncate>
        {props.item.topic?.text}
      </Text>
      <Text size="sm" c="dimmed" truncate>
        {props.item.payload?.[0]?.contentString}
      </Text>
    </Box>
  );
}

function DetailPanel(props: { readonly item: Communication }): JSX.Element {
  return (
    <Paper style={{ flex: 1 }} p="xl">
      <Text fw={800} fz="lg">
        {props.item.topic?.text}
      </Text>
      <Text mt="md">{props.item.payload?.[0]?.contentString}</Text>
    </Paper>
  );
}

export const Basic = (): JSX.Element => {
  return (
    <Document>
      <div style={{ height: 600 }}>
        <ResourceBoard
          search={{ resourceType: 'Communication' }}
          renderItem={(item, ctx) => <ItemRow item={item as Communication} selected={ctx.selected} />}
          renderDetail={(item) => <DetailPanel item={item as Communication} />}
        />
      </div>
    </Document>
  );
};

export const WithTabsAndActions = (): JSX.Element => {
  const [selectedId, setSelectedId] = useState<string | undefined>('comm-1');
  const loadItems = useCallback(async () => ({ items: sampleItems, total: sampleItems.length }), []);
  return (
    <Document>
      <div style={{ height: 600 }}>
        <ResourceBoard
          search={{ resourceType: 'Communication' }}
          selectedId={selectedId}
          loadItems={loadItems}
          tabs={[
            { value: 'in-progress', label: 'In Progress', uri: '/in-progress' },
            { value: 'completed', label: 'Completed', uri: '/completed' },
          ]}
          activeTab="in-progress"
          headerActions={
            <Tooltip label="New item" position="bottom">
              <ActionIcon radius="xl" variant="filled" color="blue" size={32}>
                <IconPlus size={16} />
              </ActionIcon>
            </Tooltip>
          }
          renderItem={(item, ctx) => (
            <div onClick={() => setSelectedId(item.id)} onKeyDown={() => {}} role="presentation">
              <ItemRow item={item as Communication} selected={ctx.selected} />
            </div>
          )}
          renderDetail={(item) => <DetailPanel item={item as Communication} />}
        />
      </div>
    </Document>
  );
};

export const CustomLoadItems = (): JSX.Element => {
  const loadItems = useCallback(async () => ({ items: sampleItems, total: sampleItems.length }), []);
  return (
    <Document>
      <div style={{ height: 600 }}>
        <ResourceBoard
          search={{ resourceType: 'Communication' }}
          selectedId="comm-2"
          loadItems={loadItems}
          renderItem={(item, ctx) => <ItemRow item={item as Communication} selected={ctx.selected} />}
          renderDetail={(item) => <DetailPanel item={item as Communication} />}
        />
      </div>
    </Document>
  );
};
