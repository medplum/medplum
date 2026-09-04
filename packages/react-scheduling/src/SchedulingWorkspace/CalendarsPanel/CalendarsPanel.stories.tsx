// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { BookableActorType } from '../../actors';
import type { CalendarsPanelItem } from './CalendarsPanel';
import { CalendarsPanel } from './CalendarsPanel';

export default {
  title: 'Medplum/SchedulingWorkspace/CalendarsPanel',
  component: CalendarsPanel,
} as Meta;

type PanelItems = Record<BookableActorType, CalendarsPanelItem[]>;

// Every section is multi-select: any subset may be selected/visible.
const items: PanelItems = {
  Practitioner: [
    { id: 'prov-1', label: 'Lisa Caddy', color: 'indigo' },
    { id: 'prov-2', label: 'Michelle Bryant', color: 'teal' },
    { id: 'prov-3', label: 'Gerald Miller', color: 'pink' },
    { id: 'prov-4', label: 'Tomas Erikson', color: 'violet' },
  ],
  Device: [
    { id: 'dev-1', label: 'Ultrasound Machine 1', color: 'blue' },
    { id: 'dev-2', label: 'Ultrasound Machine 2', color: 'cyan' },
  ],
  Location: [
    { id: 'room-1', label: 'Exam Room A', color: 'lime' },
    { id: 'room-2', label: 'Exam Room B', color: 'red' },
    { id: 'room-3', label: 'Exam Room C', color: 'yellow' },
  ],
};

const noItems: PanelItems = { Practitioner: [], Device: [], Location: [] };

function toggleItem(items: PanelItems, actorType: BookableActorType, id: string): PanelItems {
  return {
    ...items,
    [actorType]: items[actorType].map((item) =>
      item.id === id ? { ...item, selected: !(item.selected ?? true) } : item
    ),
  };
}

export const Basic = (): JSX.Element => {
  const [panelItems, setPanelItems] = useState(items);

  return (
    <div style={{ width: 300 }}>
      <CalendarsPanel
        items={panelItems}
        onToggle={(actorType, id) => setPanelItems((prev) => toggleItem(prev, actorType, id))}
      />
    </div>
  );
};

// While the Location or Service Type filter changes, the candidates for every section are
// re-fetched together — `candidatesLoading` reflects that single fetch.
export const CandidatesLoading = (): JSX.Element => {
  return (
    <div style={{ width: 300 }}>
      <CalendarsPanel items={noItems} candidatesLoading />
    </div>
  );
};

// A soloed Location/Service Type can narrow the candidates down to nothing for an actor type —
// each empty section shows dim placeholder text in place of its (now empty) list.
export const NoCandidates = (): JSX.Element => {
  return (
    <div style={{ width: 300 }}>
      <CalendarsPanel items={noItems} />
    </div>
  );
};
