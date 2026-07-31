// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Container } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import { Loading, SearchControl, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';

export function App(): JSX.Element {
  const medplum = useMedplum();
  // SearchControl is a controlled component -- it has no internal paging/sorting state of its
  // own. Clicking a pagination button just calls `onChange` with the updated search; without
  // this state (and feeding it back in as the `search` prop) the click has nowhere to go and
  // every "page" re-fetches the same one.
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['name', 'birthDate', 'gender'],
  });

  if (medplum.isLoading()) {
    return <Loading />;
  }

  // This page never authenticates in the browser, so anyone who can reach it can list every
  // Patient the proxy's M2M credential is allowed to see -- there's no per-user scoping. A real
  // deployment needs its own auth in front of this (see the comment in server/proxy.ts) and a
  // ClientApplication access policy scoped to only what an unauthenticated page should expose.
  return (
    <Container size="xl" py="xl">
      <SearchControl search={search} onChange={(e) => setSearch(e.definition)} />
    </Container>
  );
}
