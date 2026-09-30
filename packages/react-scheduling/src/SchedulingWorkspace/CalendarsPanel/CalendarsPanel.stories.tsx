// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { BookableActorType } from '../../actors';
import { withFixtures } from '../../stories/decorators';
import { SchedulingFixtures } from '../../stories/scheduling';
import { CalendarFilters } from '../CalendarFilters';
import type { CalendarsPanelItem } from './CalendarsPanel';
import { CalendarsPanel } from './CalendarsPanel';

// Nothing in these stories narrows the lists below, so a choice goes nowhere.
const IGNORE_FILTER_CHOICE = (): void => undefined;

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

/**
 * The filters above the lists, as the workspace passes them: two typeaheads searching the
 * server, so neither is limited to what a first page happened to hold. Clicking a field
 * without typing offers a first page anyway, which is what a small clinic sees.
 *
 * Narrowing the calendars to what was picked is the host's job, and there is no host
 * here, so a choice goes nowhere. The fields couple themselves either way — a newly
 * chosen site drops a chosen visit type it does not hold.
 *
 * @returns The story.
 */
export const WithFilters = (): JSX.Element => {
  const [panelItems, setPanelItems] = useState(items);

  return (
    <div style={{ width: 300 }}>
      <CalendarsPanel
        items={panelItems}
        onToggle={(actorType, id) => setPanelItems((prev) => toggleItem(prev, actorType, id))}
        filters={<CalendarFilters onChange={IGNORE_FILTER_CHOICE} />}
      />
    </div>
  );
};
WithFilters.decorators = [withFixtures(SchedulingFixtures)];

// While a filter changes, the candidates for every section are re-fetched together —
// `candidatesLoading` reflects that single fetch. The filter fields keep their own
// spinners, inside themselves, so a filter is answerable while the lists are still coming.
export const CandidatesLoading = (): JSX.Element => {
  return (
    <div style={{ width: 300 }}>
      <CalendarsPanel items={noItems} filters={<CalendarFilters onChange={IGNORE_FILTER_CHOICE} />} candidatesLoading />
    </div>
  );
};
CandidatesLoading.decorators = [withFixtures(SchedulingFixtures)];

// A chosen site or visit type can narrow the candidates down to nothing for an actor type —
// each empty section shows dim placeholder text in place of its (now empty) list.
export const NoCandidates = (): JSX.Element => {
  return (
    <div style={{ width: 300 }}>
      <CalendarsPanel items={noItems} filters={<CalendarFilters onChange={IGNORE_FILTER_CHOICE} />} />
    </div>
  );
};
NoCandidates.decorators = [withFixtures(SchedulingFixtures)];
