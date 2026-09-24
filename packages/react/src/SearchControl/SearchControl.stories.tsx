// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { Meta } from '@storybook/react';
import { IconArchive, IconHistory, IconRefresh, IconReport } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
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

export const ToolbarActions = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'MedicationRequest',
    fields: ['id', '_lastUpdated', 'status'],
  });

  return (
    <SearchControl
      search={search}
      onNew={() => console.log('onNew')}
      hideRefresh
      toolbarActions={[
        {
          key: 'sync',
          label: 'Sync with DoseSpot',
          icon: <IconRefresh size={16} />,
          onClick: () => console.log('sync'),
        },
      ]}
      onChange={(e) => setSearch(e.definition)}
    />
  );
};

export const CustomActions = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      onNew={() => console.log('onNew')}
      onDelete={(ids) => console.log('onDelete', ids)}
      toolbarActions={[
        {
          key: 'sync',
          label: 'Sync',
          icon: <IconRefresh size={16} />,
          onClick: (ids) => console.log('sync', ids),
        },
        {
          key: 'reports',
          label: 'Reports',
          icon: <IconReport size={16} />,
          href: '/reports',
        },
      ]}
      menuActions={[
        {
          key: 'archive',
          label: 'Archive',
          icon: <IconArchive size={16} />,
          requiresSelection: true,
          onClick: (ids) => console.log('archive', ids),
        },
        {
          key: 'audit',
          label: 'Audit Log',
          icon: <IconHistory size={16} />,
          href: '/AuditEvent',
        },
      ]}
      onChange={(e) => setSearch(e.definition)}
    />
  );
};

export const DeleteDefault = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      onDelete={(ids) => console.log('onDelete', ids)}
      onChange={(e) => setSearch(e.definition)}
    />
  );
};

export const DeleteCustomCopy = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      onDelete={(ids) => console.log('onDelete', ids)}
      confirmDelete={{
        title: (count) => `Archive ${count} ${count === 1 ? 'patient' : 'patients'}?`,
        message: (count) => `${count === 1 ? 'This patient' : 'These patients'} will be hidden from search results.`,
        confirmLabel: 'Archive',
      }}
      onChange={(e) => setSearch(e.definition)}
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
    fields: ['id', '_lastUpdated', 'name'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      additionalColumns={[{ name: 'Computed', renderCell: (resource) => `computed-${resource.id}` }]}
      onChange={(e) => setSearch(e.definition)}
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
