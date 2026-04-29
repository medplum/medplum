// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { QueryTypes } from '@medplum/core';
import { resolveId } from '@medplum/core';
import type { Patient, Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import { useEffect, useMemo, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

/** Descriptor for a single FHIR search that a section needs. */
export interface FhirSearchDescriptor {
  /** Unique key used to access this search's results via `SectionResults[key]`. */
  readonly key: string;
  readonly resourceType: ResourceType;
  /** Which search param references the patient. Defaults to 'subject'. Examples: 'patient', 'beneficiary'. */
  readonly patientParam?: string;
  /**
   * Additional search params — same format as the 2nd arg to medplum.searchResources().
   * When using a string, do not include _count or _sort; they are appended automatically.
   */
  readonly query?: QueryTypes;
}

/** Named map of FHIR results for a section: `results[searchKey]` returns the Resource[] for that search. */
export type SectionResults = Record<string, Resource[]>;

export interface PatientSummaryData {
  /** One SectionResults map per section, indexed to match the sections array. */
  readonly sectionData: SectionResults[];
  readonly loading: boolean;
  readonly error: Error | undefined;
}

/**
 * Build a deduplication key for a search descriptor.
 * Searches with the same key are executed only once and their results shared.
 * @param search - The search descriptor to build a key for.
 * @returns A string key that uniquely identifies the search configuration.
 */
function buildSearchKey(search: FhirSearchDescriptor): string {
  const param = search.patientParam ?? 'subject';
  const query = search.query;

  let queryStr = '';
  if (query !== undefined && query !== null) {
    if (typeof query === 'string') {
      queryStr = query;
    } else if (query instanceof URLSearchParams) {
      const entries = Array.from(query.entries()).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
      queryStr = JSON.stringify(entries);
    } else if (Array.isArray(query)) {
      const sorted = [...query].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
      queryStr = JSON.stringify(sorted);
    } else {
      const sorted = Object.entries(query)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b));
      queryStr = JSON.stringify(sorted);
    }
  }

  return `${search.resourceType}:${param}:${queryStr}`;
}

/**
 * Build a stable fingerprint from sections' search configurations.
 * Used to avoid re-fetching when sections change by reference but not by content.
 * @param sections - The section configs to fingerprint.
 * @returns A string fingerprint representing the search configuration.
 */
function buildSectionsFingerprint(
  sections: { readonly key: string; readonly searches?: FhirSearchDescriptor[] }[]
): string {
  return sections
    .map((s) => {
      const searchKeys = s.searches ? s.searches.map(buildSearchKey).join(',') : '';
      return `${s.key}:[${searchKeys}]`;
    })
    .join('|');
}

/**
 * Hook that collects all FHIR searches from section configs, deduplicates them,
 * executes them in parallel, and routes results back to each section.
 * Uses Promise.allSettled so a single failing search does not block all sections —
 * sections whose searches fail gracefully receive empty arrays.
 * @param patient - The patient or patient reference to fetch data for.
 * @param sections - The section configs defining which searches to execute.
 * @returns Section data, loading state, and any error.
 */
export function usePatientSummaryData(
  patient: Patient | Reference<Patient>,
  sections: { readonly key: string; readonly searches?: FhirSearchDescriptor[] }[]
): PatientSummaryData {
  const medplum = useMedplum();
  const [sectionData, setSectionData] = useState<SectionResults[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  // Stabilize sections reference: only change when the search configuration actually changes.
  const sectionsFingerprint = buildSectionsFingerprint(sections);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on fingerprint for content-based stability
  const stableSections = useMemo(() => sections, [sectionsFingerprint]);

  // Memoize the patient ID to avoid re-fetching on reference changes
  const patientId = useMemo(() => resolveId(patient), [patient]);

  useEffect(() => {
    if (!patientId) {
      return undefined;
    }

    let stale = false;
    const ref = `Patient/${patientId}`;
    const searchMeta = { _count: 100, _sort: '-_lastUpdated' };

    // Collect unique searches and build a mapping from deduplication key to index
    const uniqueSearches: FhirSearchDescriptor[] = [];
    const searchKeyToIndex = new Map<string, number>();

    // For each section, for each search, record the deduplication index and result key
    const sectionSearchMapping: { searchIdx: number; resultKey: string }[][] = [];

    for (const section of stableSections) {
      const mapping: { searchIdx: number; resultKey: string }[] = [];
      if (section.searches) {
        for (const search of section.searches) {
          const deduplicationKey = buildSearchKey(search);
          let idx = searchKeyToIndex.get(deduplicationKey);
          if (idx === undefined) {
            idx = uniqueSearches.length;
            searchKeyToIndex.set(deduplicationKey, idx);
            uniqueSearches.push(search);
          }
          mapping.push({ searchIdx: idx, resultKey: search.key });
        }
      }
      sectionSearchMapping.push(mapping);
    }

    if (uniqueSearches.length === 0) {
      // No searches needed — fill empty results
      setSectionData(stableSections.map(() => ({})));
      setLoading(false);
      return undefined;
    }

    // Execute all unique searches in parallel
    const promises = uniqueSearches.map((search) => {
      const patientParam = search.patientParam ?? 'subject';
      const baseQuery: Record<string, string | number | boolean> = {
        [patientParam]: ref,
      };

      if (search.query) {
        if (typeof search.query === 'string') {
          // String query — _count and _sort are appended automatically; do not include them in the query string.
          return medplum.searchResources(
            search.resourceType,
            `${patientParam}=${ref}&${search.query}&_count=100&_sort=-_lastUpdated`
          );
        } else if (search.query instanceof URLSearchParams) {
          search.query.forEach((value, key) => {
            baseQuery[key] = value;
          });
        } else if (Array.isArray(search.query)) {
          for (const [key, value] of search.query) {
            baseQuery[key] = value;
          }
        } else {
          for (const [key, value] of Object.entries(search.query)) {
            if (value !== undefined) {
              baseQuery[key] = value;
            }
          }
        }
      }

      return medplum.searchResources(search.resourceType, { ...searchMeta, ...baseQuery });
    });

    setLoading(true);
    setError(undefined);

    // allSettled ensures a single failing search does not block the rest — each section
    // renders with whatever data is available; failed searches produce empty arrays.
    Promise.allSettled(promises)
      .then((settledResults) => {
        if (stale) {
          return;
        }

        // Route results back to sections using named keys
        const data: SectionResults[] = sectionSearchMapping.map((mapping) => {
          const sectionResult: SectionResults = {};
          for (const { searchIdx, resultKey } of mapping) {
            const settled = settledResults[searchIdx];
            sectionResult[resultKey] = settled.status === 'fulfilled' ? settled.value : [];
          }
          return sectionResult;
        });

        setSectionData(data);
        setLoading(false);

        // Surface the first error so the UI can indicate a partial load failure
        const failures = settledResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (failures.length > 0) {
          console.error(
            'Some patient summary searches failed:',
            failures.map((f) => f.reason)
          );
          const firstError = failures[0].reason;
          setError(firstError instanceof Error ? firstError : new Error(String(firstError)));
        }
      })
      .catch((err: unknown) => {
        if (!stale) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });

    return () => {
      stale = true;
    };
  }, [medplum, patientId, stableSections]);

  return { sectionData, loading, error };
}
