// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block example
import { Alert, Group, List, Loader, Stack, Text, TextInput } from '@mantine/core';
import { isOk } from '@medplum/core';
import { ResourceName } from '@medplum/react';
import { useSearchResources } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useState } from 'react';

export function PatientSearch(): JSX.Element {
  const [name, setName] = useState('');
  const [patients, loading, outcome] = useSearchResources('Patient', {
    ...(name ? { name } : {}),
    _count: '20',
    _sort: '-_lastUpdated',
  });

  let results: JSX.Element;
  // Before the search effect runs, loading is false and both patients and outcome are undefined.
  if (loading || (!patients && !outcome)) {
    results = (
      <Group role="status">
        <Loader size="sm" aria-hidden="true" />
        <Text>Loading patients...</Text>
      </Group>
    );
  } else if (outcome && !isOk(outcome)) {
    results = (
      <Alert color="red" title="Unable to load patients">
        Check your connection and access, then try again.
      </Alert>
    );
  } else if (!patients?.length) {
    results = <Text>No matching patients.</Text>;
  } else {
    results = (
      <Stack gap="xs">
        <Text>First page of matching patients</Text>
        <List>
          {patients.map((patient) => (
            <List.Item key={patient.id}>
              <ResourceName value={patient} />
            </List.Item>
          ))}
        </List>
      </Stack>
    );
  }

  return (
    <Stack component="section">
      <TextInput label="Patient name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
      {results}
    </Stack>
  );
}
// end-block example
