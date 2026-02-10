// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { resolveId } from '@medplum/core';
import type { Patient, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FhirSearchDescriptor, PatientSummarySectionConfig } from './PatientSummary.types';

export interface PatientSummaryData {
  /** sectionData[i][j] = Resource[] for section i's search j */
  readonly sectionData: Resource[][][];
  readonly loading: boolean;
}

/**
 * Build a deduplication key for a search descriptor.
 * Searches with the same key are executed only once and their results shared.
 */
function buildSearchKey(search: FhirSearchDescriptor): string {
  const param = search.patientParam ?? 'subject';
  const query = search.query;

  let queryStr = '';
  if (query !== undefined && query !== null) {
    if (typeof query === 'string') {
      queryStr = query;
    } else if (query instanceof URLSearchParams) {
      // Sort entries for stable key
      const entries = Array.from(query.entries()).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
      queryStr = JSON.stringify(entries);
    } else if (Array.isArray(query)) {
      const sorted = [...query].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
      queryStr = JSON.stringify(sorted);
    } else {
      // Record<string, string | number | boolean | undefined>
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
 */
function buildSectionsFingerprint(sections: PatientSummarySectionConfig[]): string {
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
 */
export function usePatientSummaryData(
  patient: Patient | Reference<Patient>,
  sections: PatientSummarySectionConfig[]
): PatientSummaryData {
  const medplum = useMedplum();
  const [sectionData, setSectionData] = useState<Resource[][][]>([]);
  const [loading, setLoading] = useState(true);

  // Stabilize sections reference: only change when the search configuration actually changes.
  const sectionsFingerprint = buildSectionsFingerprint(sections);
  const sectionsRef = useRef(sections);
  const stableFingerprint = useRef(sectionsFingerprint);

  if (stableFingerprint.current !== sectionsFingerprint) {
    stableFingerprint.current = sectionsFingerprint;
    sectionsRef.current = sections;
  }

  const stableSections = sectionsRef.current;

  // Memoize the patient ID to avoid re-fetching on reference changes
  const patientId = useMemo(() => resolveId(patient), [patient]);

  useEffect(() => {
    if (!patientId) {
      return;
    }

    let stale = false;
    const ref = `Patient/${patientId}`;
    const searchMeta = { _count: 100, _sort: '-_lastUpdated' };

    // Collect unique searches and build a mapping from search key to index
    const uniqueSearches: FhirSearchDescriptor[] = [];
    const searchKeyToIndex = new Map<string, number>();

    // For each section, for each search, record the mapping
    const sectionSearchMapping: number[][] = [];

    for (const section of stableSections) {
      const mapping: number[] = [];
      if (section.searches) {
        for (const search of section.searches) {
          const key = buildSearchKey(search);
          let idx = searchKeyToIndex.get(key);
          if (idx === undefined) {
            idx = uniqueSearches.length;
            searchKeyToIndex.set(key, idx);
            uniqueSearches.push(search);
          }
          mapping.push(idx);
        }
      }
      sectionSearchMapping.push(mapping);
    }

    if (uniqueSearches.length === 0) {
      // No searches needed — fill empty results
      setSectionData(stableSections.map(() => []));
      setLoading(false);
      return;
    }

    // Execute all unique searches in parallel
    const promises = uniqueSearches.map((search) => {
      const patientParam = search.patientParam ?? 'subject';
      const baseQuery: Record<string, string | number | boolean> = {
        [patientParam]: ref,
      };

      // Merge additional query params
      if (search.query) {
        if (typeof search.query === 'string') {
          // String query — append to the patient param
          return medplum.searchResources(search.resourceType, `${patientParam}=${ref}&${search.query}&_count=100&_sort=-_lastUpdated`);
        } else if (search.query instanceof URLSearchParams) {
          search.query.forEach((value, key) => {
            baseQuery[key] = value;
          });
        } else if (Array.isArray(search.query)) {
          for (const [key, value] of search.query) {
            baseQuery[key] = value;
          }
        } else {
          // Record<string, string | number | boolean | undefined>
          for (const [key, value] of Object.entries(search.query)) {
            if (value !== undefined) {
              baseQuery[key] = value;
            }
          }
        }
      }

      return medplum.searchResources(search.resourceType, { ...baseQuery, ...searchMeta });
    });

    setLoading(true);
    Promise.all(promises)
      .then((results) => {
        if (stale) {
          return;
        }
        // Route results back to sections
        const data: Resource[][][] = sectionSearchMapping.map((mapping) =>
          mapping.map((searchIdx) => results[searchIdx] as Resource[])
        );
        setSectionData(data);
        setLoading(false);
      })
      .catch((err) => {
        if (stale) {
          return;
        }
        console.error(err);
        setLoading(false);
      });

    return () => {
      stale = true;
    };
  }, [medplum, patientId, stableSections]);

  return { sectionData, loading };
}
