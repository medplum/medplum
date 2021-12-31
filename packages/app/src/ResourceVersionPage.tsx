import { Bundle, BundleEntry, OperationOutcome, Resource } from '@medplum/fhirtypes';
import {
  Document,
  Loading,
  MedplumLink,
  ResourceDiff,
  Tab,
  TabList,
  TabPanel,
  TabSwitch,
  TitleBar,
  useMedplum,
} from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function ResourceVersionPage(): JSX.Element {
  const navigate = useNavigate();
  const { resourceType, id, versionId, tab } = useParams() as {
    resourceType: string;
    id: string;
    versionId: string;
    tab: string;
  };
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [historyBundle, setHistoryBundle] = useState<Bundle | undefined>();
  const [error, setError] = useState<OperationOutcome | undefined>();

  function loadResource(): Promise<void> {
    setError(undefined);
    setLoading(true);
    return medplum
      .readHistory(resourceType, id)
      .then((result) => setHistoryBundle(result))
      .then(() => setLoading(false))
      .catch((reason) => {
        setError(reason);
        setLoading(false);
      });
  }

  useEffect(() => {
    loadResource();
  }, [resourceType, id]);

  if (loading) {
    return <Loading />;
  }

  if (!historyBundle) {
    return (
      <Document>
        <h1>Resource not found</h1>
        <MedplumLink to={`/${resourceType}`}>Return to search page</MedplumLink>
      </Document>
    );
  }

  const entries = historyBundle.entry as BundleEntry[];
  const index = entries.findIndex((entry) => entry.resource?.meta?.versionId === versionId);
  if (index === -1) {
    return (
      <Document>
        <h1>Version not found</h1>
        <MedplumLink to={`/${resourceType}/${id}`}>Return to resource</MedplumLink>
      </Document>
    );
  }

  const value = entries[index].resource as Resource;
  const prev = index < entries.length - 1 ? entries[index + 1].resource : undefined;
  const defaultTab = 'diff';
  return (
    <>
      <TitleBar>
        <h1>{`${resourceType} ${id}`}</h1>
      </TitleBar>
      <TabList
        value={tab || defaultTab}
        onChange={(name: string) => navigate(`/${resourceType}/${id}/_history/${versionId}/${name}`)}
      >
        <Tab name="diff" label="Diff" />
        <Tab name="raw" label="Raw" />
      </TabList>
      <Document>
        {error && <pre data-testid="error">{JSON.stringify(error, undefined, 2)}</pre>}
        <TabSwitch value={tab || defaultTab}>
          <TabPanel name="diff">
            {prev ? (
              <>
                <ul>
                  <li>Current: {value.meta?.versionId}</li>
                  <li>
                    Previous:{' '}
                    <MedplumLink to={`/${resourceType}/${id}/_history/${prev.meta?.versionId}`}>
                      {prev.meta?.versionId}
                    </MedplumLink>
                  </li>
                </ul>
                <ResourceDiff original={prev} revised={value} />
              </>
            ) : (
              <>
                <ul>
                  <li>Current: {value.meta?.versionId}</li>
                  <li>Previous: (none)</li>
                </ul>
                <pre>{JSON.stringify(value, undefined, 2)}</pre>
              </>
            )}
          </TabPanel>
          <TabPanel name="raw">
            <pre>{JSON.stringify(value, undefined, 2)}</pre>
          </TabPanel>
        </TabSwitch>
      </Document>
    </>
  );
}
