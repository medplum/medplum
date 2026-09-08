// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Organization, Parameters } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useMemo, useState } from 'react';
import type { CandidPayerPage } from '../utils/billing';
import { buildPayerRefreshOps, isPayerNotFoundError, parsePayerSearchPage } from '../utils/billing';
import { CANDID_GET_PAYERS_BOT_IDENTIFIER, CANDID_PAYER_UUID_SYSTEM } from '../utils/candid';
import { showErrorNotification, showSuccessNotification } from '../utils/notifications';

// Candid's directory paginates by opaque cursor with no total count, so the pagination control
// can only offer loaded pages plus one; stepping onto the extra page fetches the next page with
// the stored cursor and appends it to the loaded results.
const SEARCH_PAGE_SIZE = 20;

/**
 * State and operations for the Candid payer directory.
 *
 * - `botId` — ID of the candid-get-payers bot; undefined while looking up, '' when not deployed.
 * - `importedPayers` — payers imported into the project, recognized by the Candid payer UUID identifier.
 * - `importedUuids` — Candid payer UUIDs of the imported payers.
 * - `searchResults` — the current page of directory search results, or undefined before the first search.
 * - `pageCount` — pages reachable in the pagination control: loaded pages plus one past them
 *   when the directory has more.
 * - `page` — 1-based current search results page.
 * - `importPayers` — persists the directory entries with the given Candid payer UUIDs (across all
 *   loaded results).
 * - `refreshPayer` — re-syncs an imported payer from the directory; returns the patched
 *   Organization, or undefined when it was already in sync or the refresh failed. A payer no
 *   longer in the directory is marked inactive rather than deleted.
 */
export interface CandidPayerDirectory {
  botId: string | undefined;
  importedPayers: WithId<Organization>[];
  importedUuids: Set<string>;
  searchResults: Organization[] | undefined;
  pageCount: number;
  page: number;
  searching: boolean;
  fetchingPage: boolean;
  importing: boolean;
  refreshing: boolean;
  search: (term: string) => Promise<void>;
  setPage: (pageNumber: number) => Promise<void>;
  clearSearch: () => void;
  importPayers: (uuids: Set<string>) => Promise<void>;
  refreshPayer: (org: WithId<Organization>) => Promise<WithId<Organization> | undefined>;
}

export function useCandidPayerDirectory(): CandidPayerDirectory {
  const medplum = useMedplum();
  const [importedPayers, setImportedPayers] = useState<WithId<Organization>[]>([]);
  const [reload, setReload] = useState(0);
  const [botId, setBotId] = useState<string | undefined>(undefined);
  const [activeTerm, setActiveTerm] = useState('');
  // All loaded search results, appended batch by batch; displayed SEARCH_PAGE_SIZE at a time.
  const [results, setResults] = useState<Organization[] | undefined>(undefined);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [fetchingPage, setFetchingPage] = useState(false);
  const [importing, setImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    medplum
      .searchResources('Organization', {
        identifier: `${CANDID_PAYER_UUID_SYSTEM}|`,
        _count: '100',
        _sort: 'name',
      })
      .then(setImportedPayers)
      .catch(showErrorNotification);
  }, [medplum, reload]);

  useEffect(() => {
    medplum
      .searchOne('Bot', {
        identifier: `${CANDID_GET_PAYERS_BOT_IDENTIFIER.system}|${CANDID_GET_PAYERS_BOT_IDENTIFIER.value}`,
      })
      .then((bot) => setBotId(bot?.id ?? ''))
      .catch(showErrorNotification);
  }, [medplum]);

  const importedUuids = useMemo(
    () =>
      new Set(importedPayers.map((org) => getIdentifier(org, CANDID_PAYER_UUID_SYSTEM)).filter(Boolean) as string[]),
    [importedPayers]
  );

  const fetchPage = async (term: string, pageToken?: string): Promise<CandidPayerPage> => {
    const result = (await medplum.executeBot(
      botId as string,
      { searchTerm: term, limit: SEARCH_PAGE_SIZE, ...(pageToken && { pageToken }) },
      'application/json'
    )) as Parameters;
    return parsePayerSearchPage(result);
  };

  const search = async (term: string): Promise<void> => {
    if (!botId) {
      return;
    }
    const trimmed = term.trim();
    setSearching(true);
    try {
      const page = await fetchPage(trimmed);
      setActiveTerm(trimmed);
      setResults(page.items ?? []);
      setPageIndex(0);
      setNextPageToken(page.nextPageToken);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setSearching(false);
    }
  };

  const setPage = async (pageNumber: number): Promise<void> => {
    const index = pageNumber - 1;
    const loaded = results?.length ?? 0;
    if (index < Math.ceil(loaded / SEARCH_PAGE_SIZE)) {
      setPageIndex(index);
      return;
    }
    if (!botId || !nextPageToken) {
      return;
    }
    setFetchingPage(true);
    try {
      const page = await fetchPage(activeTerm, nextPageToken);
      const fetched = page.items ?? [];
      const merged = loaded + fetched.length;
      setResults((prev) => [...(prev ?? []), ...fetched]);
      setPageIndex(Math.min(index, Math.max(Math.ceil(merged / SEARCH_PAGE_SIZE) - 1, 0)));
      setNextPageToken(fetched.length > 0 ? page.nextPageToken : undefined);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setFetchingPage(false);
    }
  };

  const clearSearch = (): void => {
    setActiveTerm('');
    setResults(undefined);
    setPageIndex(0);
    setNextPageToken(undefined);
  };

  const importPayers = async (uuids: Set<string>): Promise<void> => {
    // The bot returns ready-to-persist Organizations, so import is a plain create.
    const toImport = (results ?? []).filter((payer) => uuids.has(getIdentifier(payer, CANDID_PAYER_UUID_SYSTEM) ?? ''));
    if (toImport.length === 0) {
      return;
    }
    setImporting(true);
    const failures: string[] = [];
    for (const payer of toImport) {
      try {
        await medplum.createResource(payer);
      } catch (error) {
        failures.push(`${payer.name}: ${normalizeErrorString(error)}`);
      }
    }
    setImporting(false);
    setReload((r) => r + 1);
    const importedCount = toImport.length - failures.length;
    if (importedCount > 0) {
      showSuccessNotification({
        title: 'Success',
        message: `Imported ${importedCount} payer${importedCount === 1 ? '' : 's'}`,
      });
    }
    if (failures.length > 0) {
      showErrorNotification(new Error(`Failed to import ${failures.length} payer(s). ${failures.join('; ')}`));
    }
  };

  const refreshPayer = async (org: WithId<Organization>): Promise<WithId<Organization> | undefined> => {
    const payerUuid = getIdentifier(org, CANDID_PAYER_UUID_SYSTEM);
    if (!botId || !payerUuid) {
      return undefined;
    }
    setRefreshing(true);
    try {
      const fresh = (await medplum.executeBot(botId, { payerUuid }, 'application/json')) as Organization;
      const ops = buildPayerRefreshOps(org, fresh);
      if (ops.length === 0) {
        showSuccessNotification({ title: 'Refresh complete', message: 'Payer is up to date with the directory' });
        return undefined;
      }
      const updated = await medplum.patchResource('Organization', org.id, ops);
      setReload((r) => r + 1);
      showSuccessNotification({ title: 'Refresh complete', message: 'Payer updated from the directory' });
      return updated;
    } catch (error) {
      if (!isPayerNotFoundError(error)) {
        showErrorNotification(error);
      } else if (org.active === false) {
        showErrorNotification(new Error('This payer is still not in the Candid payer directory.'));
      } else {
        try {
          // Deactivate rather than delete: claims and coverages may reference the payer.
          const updated = await medplum.patchResource('Organization', org.id, [
            { op: 'add', path: '/active', value: false },
          ]);
          setReload((r) => r + 1);
          showErrorNotification(
            new Error('This payer is no longer in the Candid payer directory and has been marked inactive.')
          );
          return updated;
        } catch (patchError) {
          showErrorNotification(patchError);
        }
      }
      return undefined;
    } finally {
      setRefreshing(false);
    }
  };

  return {
    botId,
    importedPayers,
    importedUuids,
    searchResults: results
      ? results.slice(pageIndex * SEARCH_PAGE_SIZE, (pageIndex + 1) * SEARCH_PAGE_SIZE)
      : undefined,
    pageCount: results ? Math.ceil(results.length / SEARCH_PAGE_SIZE) + (nextPageToken ? 1 : 0) : 0,
    page: pageIndex + 1,
    searching,
    fetchingPage,
    importing,
    refreshing,
    search,
    setPage,
    clearSearch,
    importPayers,
    refreshPayer,
  };
}
