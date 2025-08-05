// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Container, Group, Pagination, SegmentedControl, SimpleGrid, Stack, Title } from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import { Bundle, OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import {
  DescriptionList,
  DescriptionListEntry,
  Document,
  getPaginationControlProps,
  Loading,
  MedplumLink,
  Panel,
  ResourceBadge,
  ResourceDiff,
  useMedplum,
} from '@medplum/react';
import { JSX, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

export function ResourceVersionPage(): JSX.Element {
  const navigate = useNavigate();
  const { resourceType, id, versionId, tab } = useParams() as {
    resourceType: string;
    id: string;
    versionId: string;
    tab: string;
  };
  const medplum = useMedplum();
  const [loading, setLoading] = useState(true);
  const [historyBundle, setHistoryBundle] = useState<Bundle | undefined>();
  const [error, setError] = useState<OperationOutcome | undefined>();

  useEffect(() => {
    setError(undefined);
    setLoading(true);
    medplum
      .readHistory(resourceType as ResourceType, id)
      .then((result) => setHistoryBundle(result))
      .then(() => setLoading(false))
      .catch((reason) => {
        setError(reason);
        setLoading(false);
      });
  }, [medplum, resourceType, id]);

  if (loading) {
    return <Loading />;
  }

  const entries = historyBundle?.entry ?? [];
  const index = entries.findIndex((entry) => entry.resource?.meta?.versionId === versionId);
  if (index === -1) {
    return (
      <Document>
        <Title>Version not found</Title>
        <MedplumLink to={`/${resourceType}/${id}`}>Return to resource</MedplumLink>
      </Document>
    );
  }

  const value = entries[index].resource as Resource;
  const prev = index < entries.length - 1 ? entries[index + 1].resource : undefined;
  const defaultTab = 'diff';
  const currTab = tab || defaultTab;
  const paginationIndex = entries.length - index;
  return (
    <Container maw={1200}>
      <Panel>
        <Stack gap="lg">
          {error && <pre data-testid="error">{JSON.stringify(error, undefined, 2)}</pre>}
          <SimpleGrid cols={2} mb="lg">
            <Pagination
              total={entries.length}
              value={paginationIndex}
              getControlProps={getPaginationControlProps}
              onChange={(newIndex) =>
                navigate(
                  `/${resourceType}/${id}/_history/${entries[entries.length - newIndex]?.resource?.meta?.versionId}/${currTab}`
                )?.catch(console.error)
              }
            />
            <Group justify="right">
              <SegmentedControl
                data={[
                  { value: 'diff', label: 'Diff' },
                  { value: 'raw', label: 'Raw' },
                ]}
                value={currTab}
                onChange={(name) =>
                  navigate(`/${resourceType}/${id}/_history/${versionId}/${name || defaultTab}`)?.catch(console.error)
                }
              />
            </Group>
          </SimpleGrid>
          <Box mb="lg">
            <DescriptionList compact>
              <DescriptionListEntry term="Version ID">{value.meta?.versionId}</DescriptionListEntry>
              <DescriptionListEntry term="Author">
                <ResourceBadge key={value.meta?.author?.reference} value={value.meta?.author} link={true} />
              </DescriptionListEntry>
              <DescriptionListEntry term="Date/Time">{formatDateTime(value.meta?.lastUpdated)}</DescriptionListEntry>
            </DescriptionList>
          </Box>
          {currTab === 'diff' && <ResourceDiff original={prev ?? ({ resourceType, id } as Resource)} revised={value} />}
          {currTab === 'raw' && <pre style={{ fontSize: '9pt' }}>{JSON.stringify(value, undefined, 2)}</pre>}
        </Stack>
      </Panel>
    </Container>
  );
}
