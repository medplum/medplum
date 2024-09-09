import { Paper } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatSearchQuery, normalizeErrorString, parseSearchRequest, SearchRequest } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Loading, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import classes from './HomePage.module.css';
import { addSearchValues, getTransactionBundle, RESOURCE_TYPE_CREATION_PATHS, saveLastSearch } from './HomePage.utils';
import { exportJsonFile } from './utils';

export function HomePage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();

  useEffect(() => {
    // Parse the search from the URL
    const parsedSearch = parseSearchRequest(location.pathname + location.search);

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
      <SearchControl
        checkboxesEnabled={true}
        search={search}
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
        onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
        onChange={(e) => {
          navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
        }}
        onNew={() => {
          navigate(RESOURCE_TYPE_CREATION_PATHS[search.resourceType] ?? `/${search.resourceType}/new`);
        }}
        onExportCsv={() => {
          const url = medplum.fhirUrl(search.resourceType, '$csv') + formatSearchQuery(search);
          medplum
            .download(url)
            .then((blob: Blob) => {
              window.open(window.URL.createObjectURL(blob), '_blank');
            })
            .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
        }}
        onExportTransactionBundle={async () => {
          getTransactionBundle(search, medplum)
            .then((bundle) => exportJsonFile(JSON.stringify(bundle, undefined, 2)))
            .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
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
              .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
          }
        }}
        onBulk={(ids: string[]) => {
          navigate(`/bulk/${search.resourceType}?ids=${ids.join(',')}`);
        }}
      />
    </Paper>
  );
}
