// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { CalendarsPanelItem } from './CalendarsPanel';
import { CalendarsPanel } from './CalendarsPanel';

export default {
  title: 'Medplum/SchedulingWorkspace/CalendarsPanel',
  component: CalendarsPanel,
} as Meta;

// Providers, Devices, and Rooms are multi-select: any subset may be selected/visible.
const providers: CalendarsPanelItem[] = [
  { id: 'prov-1', label: 'Lisa Caddy', color: 'indigo' },
  { id: 'prov-2', label: 'Michelle Bryant', color: 'teal' },
  { id: 'prov-3', label: 'Gerald Miller', color: 'pink' },
  { id: 'prov-4', label: 'Tomas Erikson', color: 'violet' },
];

const devices: CalendarsPanelItem[] = [
  { id: 'dev-1', label: 'Ultrasound Machine 1', color: 'blue' },
  { id: 'dev-2', label: 'Ultrasound Machine 2', color: 'cyan' },
];

const rooms: CalendarsPanelItem[] = [
  { id: 'room-1', label: 'Exam Room A', color: 'lime' },
  { id: 'room-2', label: 'Exam Room B', color: 'red' },
  { id: 'room-3', label: 'Exam Room C', color: 'yellow' },
];

function toggleItem(items: CalendarsPanelItem[], id: string): CalendarsPanelItem[] {
  return items.map((item) => (item.id === id ? { ...item, selected: !(item.selected ?? true) } : item));
}

export const Basic = (): JSX.Element => {
  const [providerItems, setProviderItems] = useState(providers);
  const [deviceItems, setDeviceItems] = useState(devices);
  const [roomItems, setRoomItems] = useState(rooms);

  return (
    <div style={{ width: 300 }}>
      <CalendarsPanel
        providers={providerItems}
        devices={deviceItems}
        rooms={roomItems}
        onToggleProvider={(id) => setProviderItems((items) => toggleItem(items, id))}
        onToggleDevice={(id) => setDeviceItems((items) => toggleItem(items, id))}
        onToggleRoom={(id) => setRoomItems((items) => toggleItem(items, id))}
      />
    </div>
  );
};

// While the Location or Service Type filter changes, the candidates for Providers & Staff,
// Devices, and Rooms are re-fetched together — `candidatesLoading` reflects that single fetch.
export const CandidatesLoading = (): JSX.Element => {
  return (
    <div style={{ width: 300 }}>
      <CalendarsPanel providers={[]} devices={[]} rooms={[]} candidatesLoading />
    </div>
  );
};

// A soloed Location/Service Type can narrow the candidates down to nothing for a role —
// each empty section shows dim placeholder text in place of its (now empty) list.
export const NoCandidates = (): JSX.Element => {
  return (
    <div style={{ width: 300 }}>
      <CalendarsPanel providers={[]} devices={[]} rooms={[]} />
    </div>
  );
};
