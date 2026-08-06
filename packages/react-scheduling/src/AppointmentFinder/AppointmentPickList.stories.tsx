// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { AppointmentPickListItem } from './AppointmentPickList';
import { AppointmentPickList } from './AppointmentPickList';

export default {
  title: 'Medplum/AppointmentPickList',
  component: AppointmentPickList,
} as Meta;

const SITES: AppointmentPickListItem[] = [
  { id: 'main-clinic', label: 'Uro Associates - Main Clinic', description: '1 Evergreen Plaza, Springfield' },
  { id: 'satellite-clinic', label: 'Uro Associates - Satellite Clinic', description: '88 Shelbyville Road' },
];

const SERVICES: AppointmentPickListItem[] = [
  { id: 'imaging', label: 'Ultrasound Imaging', description: '30 minutes' },
  { id: 'surgery', label: 'Bariatric Surgery', description: '2 hours' },
  { id: 'walk-in', label: 'Walk-in', description: '15 minutes' },
];

/**
 * A list holding what was chosen.
 * @param props - The React props.
 * @param props.label - What the list is asking for.
 * @param props.items - The rows to choose from.
 * @param props.emptyMessage - Shown in place of the rows when there are none.
 * @param props.searchable - Whether the list carries a search field.
 * @param props.loading - Whether the rows are still being fetched.
 * @param props.error - Why the rows could not be fetched.
 * @param props.footnote - A quiet line under the rows.
 * @returns The list.
 */
function PickList(props: {
  readonly label: string;
  readonly items: readonly AppointmentPickListItem[];
  readonly emptyMessage: string;
  readonly searchable?: boolean;
  readonly loading?: boolean;
  readonly error?: string;
  readonly footnote?: string;
}): JSX.Element {
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState('');

  const items = props.searchable
    ? props.items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : props.items;

  return (
    <Document>
      <AppointmentPickList
        label={props.label}
        items={items}
        emptyMessage={props.emptyMessage}
        selectedId={selectedId}
        loading={props.loading}
        error={props.error}
        footnote={props.footnote}
        required
        query={props.searchable ? query : undefined}
        onQueryChange={props.searchable ? setQuery : undefined}
        onSelect={setSelectedId}
      />
    </Document>
  );
}

/**
 * A set short enough to read down in one go, so there is nothing to search.
 * @returns The story.
 */
export const Basic = (): JSX.Element => (
  <PickList label="Location" items={SITES} emptyMessage="No sites are set up yet." />
);

/**
 * A set long enough to need narrowing. Filtering belongs to the caller, since a
 * list this long is usually narrowed by the server rather than in the browser.
 * @returns The story.
 */
export const Searchable = (): JSX.Element => (
  <PickList
    label="Visit type"
    items={SERVICES}
    searchable
    emptyMessage="No visit types match."
    footnote="Showing visit types offered at the Main Clinic."
  />
);

export const Loading = (): JSX.Element => <PickList label="Visit type" items={[]} loading emptyMessage="" />;

export const Empty = (): JSX.Element => (
  <PickList label="Visit type" items={[]} emptyMessage="This site offers no bookable visit types." />
);

export const Failed = (): JSX.Element => (
  <PickList label="Visit type" items={[]} error="Search timed out" emptyMessage="" />
);
