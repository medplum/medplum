// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper, Stack } from '@mantine/core';
import type { Filter, SearchRequest, SortRule } from '@medplum/core';
import { DEFAULT_SEARCH_COUNT, formatSearchQuery, isReference, parseSearchRequest } from '@medplum/core';
import type { Patient, Reference, Resource, ResourceType, UserConfiguration } from '@medplum/fhirtypes';
import { Loading, SearchControl, useMedplum } from '@medplum/react';
import { IconClipboardCheck, IconFileText, IconMail, IconUsers } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { LyfePageHeader } from '../components/brand/LyfePageHeader';
import { useResourceType } from './resource/useResourceType';
import classes from './SearchPage.module.css';

export function SearchPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();
  const [total, setTotal] = useState<number>();

  useEffect(() => {
    const parsedSearch = parseSearchRequest(location.pathname + location.search);

    const populatedSearch = addSearchValues(parsedSearch, medplum.getUserConfiguration());

    if (
      location.pathname === `/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      saveLastSearch(populatedSearch);
      setSearch(populatedSearch);
    } else {
      navigate(`/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`, { replace: true })?.catch(
        console.error
      );
    }
  }, [medplum, navigate, location]);

  useResourceType(search?.resourceType, { onInvalidResourceType: () => navigate('..')?.catch(console.error) });

  // Counted separately from SearchControl, which does not surface its total.
  // Reset to undefined first so the pill never shows a stale count for the
  // resource type we just navigated away from.
  useEffect(() => {
    const resourceType = search?.resourceType;
    if (!resourceType) {
      return;
    }
    let cancelled = false;
    setTotal(undefined);
    medplum
      .search(resourceType, '_summary=count')
      .then((bundle) => {
        if (!cancelled) {
          setTotal(bundle.total);
        }
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [medplum, search?.resourceType]);

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  const header = HEADERS[search.resourceType];

  return (
    <Stack gap="md" m="xs">
      <LyfePageHeader
        icon={header?.icon}
        eyebrow={header?.eyebrow}
        title={header?.title ?? search.resourceType}
        count={total}
        description={header?.description}
      />
      <Paper shadow="xs" p="xs" className={classes.paper}>
        <SearchControl
          checkboxesEnabled={true}
          search={search}
          onClick={(e) => navigate(getResourceUrl(e.resource))?.catch(console.error)}
          onAuxClick={(e) => window.open(getResourceUrl(e.resource), '_blank')}
          onNew={() => {
            navigate(`/${search.resourceType}/new`)?.catch(console.error);
          }}
          onChange={(e) => {
            navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`)?.catch(console.error);
          }}
        />
      </Paper>
    </Stack>
  );
}

// Presentation only — the title is the name Medplum already uses for the type in
// its own navigation, so nothing is renamed. Types without an entry fall back to
// the bare resource type name and render no icon.
const HEADERS: Record<string, { icon: ReactNode; eyebrow: string; title: string; description: string }> = {
  Patient: {
    icon: <IconUsers size={20} />,
    eyebrow: 'Roster',
    title: 'Patients',
    description: 'Manage and view your patient roster',
  },
  Task: {
    icon: <IconClipboardCheck size={20} />,
    eyebrow: 'Work',
    title: 'Tasks',
    description: 'Track outstanding work assigned to you and your team',
  },
  Communication: {
    icon: <IconMail size={20} />,
    eyebrow: 'Inbox',
    title: 'Messages',
    description: 'Secure messages across your care team and patients',
  },
  DocumentReference: {
    icon: <IconFileText size={20} />,
    eyebrow: 'Records',
    title: 'Documents',
    description: 'Clinical documents gathered from connected sources',
  },
};

function addSearchValues(search: SearchRequest, config: UserConfiguration | undefined): SearchRequest {
  const resourceType = search.resourceType || getDefaultResourceType(config);
  const fields = search.fields ?? ['_id', '_lastUpdated'];
  const filters = search.filters ?? (!search.resourceType ? getDefaultFilters(resourceType) : undefined);
  const sortRules = search.sortRules ?? getDefaultSortRules(resourceType);
  const offset = search.offset ?? 0;
  const count = search.count ?? DEFAULT_SEARCH_COUNT;

  return {
    ...search,
    resourceType,
    fields,
    filters,
    sortRules,
    offset,
    count,
  };
}

function getDefaultResourceType(config: UserConfiguration | undefined): string {
  return (
    localStorage.getItem('defaultResourceType') ??
    config?.option?.find((o) => o.id === 'defaultResourceType')?.valueString ??
    'Task'
  );
}

function getDefaultFilters(resourceType: string): Filter[] | undefined {
  return getLastSearch(resourceType)?.filters;
}

function getDefaultSortRules(resourceType: string): SortRule[] {
  const lastSearch = getLastSearch(resourceType);
  if (lastSearch?.sortRules) {
    return lastSearch.sortRules;
  }
  return [{ code: '_lastUpdated', descending: true }];
}

function getLastSearch(resourceType: string): SearchRequest | undefined {
  const value = localStorage.getItem(resourceType + '-defaultSearch');
  return value ? (JSON.parse(value) as SearchRequest) : undefined;
}

function saveLastSearch(search: SearchRequest): void {
  localStorage.setItem('defaultResourceType', search.resourceType);
  localStorage.setItem(search.resourceType + '-defaultSearch', JSON.stringify(search));
}

function getResourceUrl<T extends Resource>(resource: T): string {
  const patientFields = ['patient', 'subject', 'sender'] as (keyof T)[];
  for (const key of patientFields) {
    if (key in resource) {
      const value = resource[key];
      if (isPatientReference(value)) {
        return `/${value.reference}/${resource.resourceType}/${resource.id}`;
      }
    }
  }
  return `/${resource.resourceType}/${resource.id}`;
}

function isPatientReference(input: unknown): input is Reference<Patient> & { reference: string } {
  return isReference(input) && input.reference.startsWith('Patient/');
}
