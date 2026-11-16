// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box } from '@mantine/core';
import type { Meta } from '@storybook/react';
import { IconCalendarEvent } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { matchesFilter } from '../SchedulingConfigWorkspace.utils';
import type { ConfigPanelItem } from './ConfigPanel';
import { ConfigPanel } from './ConfigPanel';

export default {
  title: 'Medplum/SchedulingConfigWorkspace/ConfigPanel',
  component: ConfigPanel,
} as Meta;

const visitTypes: Omit<ConfigPanelItem, 'selected'>[] = [
  { id: 'svc-1', label: 'Annual exam' },
  { id: 'svc-2', label: 'Blood draw' },
  { id: 'svc-3', label: 'Consult', inactive: true },
];

function Panel(props: { readonly loading?: boolean; readonly incomplete?: boolean }): JSX.Element {
  const [selected, setSelected] = useState<string>();
  const [filter, setFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const items = visitTypes
    .filter((item) => showInactive || !item.inactive)
    .filter((item) => matchesFilter(item.label, filter))
    .map((item) => ({ ...item, selected: item.id === selected }));

  return (
    <Box w={300}>
      <ConfigPanel
        sections={[
          {
            key: 'service',
            title: 'Visit types',
            noun: 'visit types',
            items: props.loading ? [] : items,
            loading: props.loading,
            incomplete: props.incomplete,
            icon: <IconCalendarEvent size={12} />,
            createLabel: 'New visit type',
            onCreate: () => undefined,
          },
        ]}
        onSelect={(_, id) => setSelected(id)}
        filter={filter}
        onFilterChange={setFilter}
        showInactive={showInactive}
        onShowInactiveChange={setShowInactive}
      />
    </Box>
  );
}

/**
 * Consult is turned off and appears, marked **Inactive**, only once **Show inactive** is ticked under the filters
 * button. The count follows the filters.
 * @returns The story.
 */
export const Basic = (): JSX.Element => <Panel />;

/** @returns The story. */
export const Loading = (): JSX.Element => <Panel loading />;

/**
 * The read stopped at its limit with more left, so the section says it is not everything.
 * @returns The story.
 */
export const Incomplete = (): JSX.Element => <Panel incomplete />;
