import { Operator, SearchRequest } from '@medplum/core';
import { Meta } from '@storybook/react';
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

export const HideFilters = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      hideFilters={true}
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

export const HideToolbarAndFilters = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      hideToolbar={true}
      hideFilters={true}
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
