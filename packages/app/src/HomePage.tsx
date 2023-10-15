import { createStyles, Paper } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  formatSearchQuery,
  normalizeErrorString,
  parseSearchDefinition,
  SearchRequest
} from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Loading, MemoizedSearchControl, useMedplum } from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { addSearchValues, canCreate, getTransactionBundle, saveLastSearch } from './HomePage.utils';
import { exportJsonFile } from './utils';

const useStyles = createStyles((theme) => {
  return {
    paper: {
      [`@media (max-width: ${theme.breakpoints.sm})`]: {
        margin: 2,
        padding: 4,
      },
    },
  };
});

export function HomePage(): JSX.Element {
  const { classes } = useStyles();
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();

  useEffect(() => {
    // Parse the search from the URL
    const parsedSearch = parseSearchDefinition(location.pathname + location.search);

    // Fill in the search with default values
    const populatedSearch = addSearchValues(parsedSearch, medplum.getUserConfiguration());

    if (
      location.pathname === `/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      // If the URL matches the parsed search, then save it and execute it
      saveLastSearch(populatedSearch);
      setSearch(populatedSearch);
    } else {
      // Otherwise, navigate to the desired URL
      navigate(`/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`);
    }
  }, [medplum, navigate, location]);

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Paper shadow="xs" m="md" p="xs" className={classes.paper}>
      <MemoizedSearchControl
        checkboxesEnabled={true}
        search={search}
        userConfig={medplum.getUserConfiguration()}
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
        onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
        onChange={(e) => {
          navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
        }}
        onNew={
          canCreate(search.resourceType)
            ? () => {
                navigate(`/${search.resourceType}/new`);
              }
            : undefined
        }
        onExportCsv={() => {
          const url = medplum.fhirUrl(search.resourceType, '$csv') + formatSearchQuery(search);
          medplum
            .download(url)
            .then((blob: Blob) => {
              window.open(window.URL.createObjectURL(blob), '_blank');
            })
            .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
        }}
        onExportTransactionBundle={async () => {
          getTransactionBundle(search, medplum)
            .then((bundle) => exportJsonFile(JSON.stringify(bundle, undefined, 2)))
            .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
        }}
        onDelete={(ids: string[]) => {
          if (window.confirm('Are you sure you want to delete these resources?')) {
            medplum.invalidateSearches(search.resourceType as ResourceType);
            medplum
              .executeBatch({
                resourceType: 'Bundle',
                type: 'batch',
                entry: ids.map((id) => ({
                  request: {
                    method: 'DELETE',
                    url: `${search.resourceType}/${id}`,
                  },
                })),
              })
              .then(() => setSearch({ ...search }))
              .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
          }
        }}
        onBulk={(ids: string[]) => {
          navigate(`/bulk/${search.resourceType}?ids=${ids.join(',')}`);
        }}
      />
    </Paper>
  );
}
