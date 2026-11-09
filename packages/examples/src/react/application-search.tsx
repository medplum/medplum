// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block example
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
    results = <p role="status">Loading patients...</p>;
  } else if (outcome && !isOk(outcome)) {
    results = <p role="alert">Unable to load patients. Check your connection and access, then try again.</p>;
  } else if (!patients?.length) {
    results = <p>No matching patients.</p>;
  } else {
    results = (
      <>
        <p>First page of matching patients</p>
        <ul>
          {patients.map((patient) => (
            <li key={patient.id}>
              <ResourceName value={patient} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section>
      <label>
        Patient name
        <input value={name} onChange={(event) => setName(event.currentTarget.value)} />
      </label>
      {results}
    </section>
  );
}
// end-block example
