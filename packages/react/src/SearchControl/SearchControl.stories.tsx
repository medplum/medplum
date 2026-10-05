// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { calculateAge, Operator } from '@medplum/core';
import type { Patient, Task } from '@medplum/fhirtypes';
import { HomerSimpson } from '@medplum/mock';
import { useMedplum } from '@medplum/react-hooks';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { SearchControl } from './SearchControl';

export default {
  title: 'Medplum/SearchControl',
  component: SearchControl,
} as Meta;

export const Checkboxes = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      onLoad={(e) => console.log('onLoad', e)}
      onClick={(e) => console.log('onClick', e)}
      onAuxClick={(e) => console.log('auxClick', e)}
      onChange={(e) => {
        console.log('onChange', e);
        setSearch(e.definition);
      }}
    />
  );
};

export const NoCheckboxes = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name'],
  });

  return (
    <SearchControl
      search={search}
      onLoad={(e) => console.log('onLoad', e)}
      onClick={(e) => console.log('onClick', e)}
      onAuxClick={(e) => console.log('auxClick', e)}
      onChange={(e) => {
        console.log('onChange', e);
        setSearch(e.definition);
      }}
    />
  );
};

export const AllButtons = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      onLoad={(e) => console.log('onLoad', e)}
      onClick={(e) => console.log('onClick', e)}
      onAuxClick={(e) => console.log('auxClick', e)}
      onNew={() => console.log('onNew')}
      onExportCsv={() => console.log('onExportCSV')}
      onDelete={() => console.log('onDelete')}
      onBulk={() => console.log('onBulk')}
      onChange={(e) => {
        console.log('onChange', e);
        setSearch(e.definition);
      }}
    />
  );
};

export const ExtraFields = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name', 'birthDate', 'active', 'telecom', 'email', 'phone'],
  });

  return (
    <SearchControl
      search={search}
      onLoad={(e) => console.log('onLoad', e)}
      onClick={(e) => console.log('onClick', e)}
      onAuxClick={(e) => console.log('auxClick', e)}
      onChange={(e) => {
        console.log('onChange', e);
        setSearch(e.definition);
      }}
    />
  );
};

export const DeleteAsync = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      onDelete={async (ids) => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 1000);
        });
        console.log('onDelete', ids);
      }}
      onChange={(e) => setSearch(e.definition)}
    />
  );
};

export const AdditionalColumns = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['name', 'birthDate'],
  });

  return (
    <SearchControl
      search={search}
      additionalColumns={[
        {
          name: 'Age',
          renderCell: (resource) => {
            const birthDate = (resource as Patient).birthDate;
            return birthDate ? calculateAge(birthDate).years : undefined;
          },
        },
      ]}
      onChange={(e) => setSearch(e.definition)}
    />
  );
};

export const ServiceRequests = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'ServiceRequest',
    fields: ['id', '_lastUpdated', 'subject', 'code', 'status', 'orderDetail', 'authoredOn'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      onLoad={(e) => console.log('onLoad', e)}
      onClick={(e) => console.log('onClick', e)}
      onAuxClick={(e) => console.log('auxClick', e)}
      onChange={(e) => {
        console.log('onChange', e);
        setSearch(e.definition);
      }}
    />
  );
};

const TASK_STATUSES: Task['status'][] = [
  'draft',
  'requested',
  'received',
  'accepted',
  'rejected',
  'ready',
  'cancelled',
  'in-progress',
  'on-hold',
  'failed',
  'completed',
  'entered-in-error',
];

/**
 * Seeds one Task per FHIR task status so the `status` column renders every badge color.
 * @returns The story element.
 */
export const StatusBadges = (): JSX.Element => {
  const medplum = useMedplum();
  const [seeded, setSeeded] = useState(false);
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Task',
    fields: ['id', 'description', 'status', 'for', 'priority'],
    filters: [{ code: 'subject', operator: Operator.EQUALS, value: 'Patient/' + HomerSimpson.id }],
    sortRules: [{ code: '_lastUpdated', descending: true }],
    count: TASK_STATUSES.length,
  });

  useEffect(() => {
    Promise.all(
      TASK_STATUSES.map((status, index) =>
        medplum.createResource<Task>({
          resourceType: 'Task',
          status,
          intent: 'order',
          priority: index % 4 === 0 ? 'urgent' : 'routine',
          description: `Task with status "${status}"`,
          for: { reference: 'Patient/' + HomerSimpson.id, display: 'Homer Simpson' },
        })
      )
    )
      .then(() => setSeeded(true))
      .catch(console.error);
  }, [medplum]);

  if (!seeded) {
    return <div>Loading...</div>;
  }

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      onLoad={(e) => console.log('onLoad', e)}
      onClick={(e) => console.log('onClick', e)}
      onAuxClick={(e) => console.log('auxClick', e)}
      onChange={(e) => {
        console.log('onChange', e);
        setSearch(e.definition);
      }}
    />
  );
};

export const Observations = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Observation',
    fields: ['id', '_lastUpdated', 'subject', 'code', 'value[x]', 'value-quantity'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      onLoad={(e) => console.log('onLoad', e)}
      onClick={(e) => console.log('onClick', e)}
      onAuxClick={(e) => console.log('auxClick', e)}
      onChange={(e) => {
        console.log('onChange', e);
        setSearch(e.definition);
      }}
    />
  );
};

export const HideToolbar = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      hideToolbar={true}
      onLoad={(e) => console.log('onLoad', e)}
      onClick={(e) => console.log('onClick', e)}
      onAuxClick={(e) => console.log('auxClick', e)}
      onChange={(e) => {
        console.log('onChange', e);
        setSearch(e.definition);
      }}
    />
  );
};

export const NoResults = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name'],
    filters: [{ code: 'name', operator: Operator.EQUALS, value: 'does not exist' }],
  });

  return (
    <SearchControl
      search={search}
      onLoad={(e) => console.log('onLoad', e)}
      onClick={(e) => console.log('onClick', e)}
      onAuxClick={(e) => console.log('auxClick', e)}
      onChange={(e) => {
        console.log('onChange', e);
        setSearch(e.definition);
      }}
    />
  );
};
