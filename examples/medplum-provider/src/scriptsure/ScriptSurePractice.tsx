// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Select } from '@mantine/core';
import type { Organization } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { SCRIPTSURE_PRACTICE_ID_SYSTEM } from '@medplum/scriptsure-react';
import type { JSX, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'medplum-provider.scriptsure.selectedPracticeOrganization';

export interface ScriptSurePracticeContextValue {
  /** ScriptSure practice-level Organizations available to the prescriber. */
  readonly practices: Organization[];
  /** The selected Organization id (bare id, passed to bots as `organizationId`), or undefined. */
  readonly selectedOrganizationId: string | undefined;
  /** Selects a practice Organization (persisted to localStorage). */
  readonly setSelectedOrganizationId: (id: string | undefined) => void;
  readonly loading: boolean;
}

const ScriptSurePracticeContext = createContext<ScriptSurePracticeContextValue>({
  practices: [],
  selectedOrganizationId: undefined,
  setSelectedOrganizationId: () => undefined,
  loading: false,
});

/**
 * Provides the prescriber's current ScriptSure practice-location selection.
 *
 * Loads the project's ScriptSure practice `Organization`s (those carrying a
 * `practice-id` identifier), defaults to the sole practice or the last-used one
 * (persisted in localStorage), and exposes the selection so prescribing flows
 * can pass `organizationId` to the vendor bots for multi-practice resolution.
 *
 * @param props - Component props.
 * @param props.children - Child nodes rendered within the provider.
 * @returns The context provider element.
 */
export function ScriptSurePracticeProvider(props: { readonly children: ReactNode }): JSX.Element {
  const medplum = useMedplum();
  const [practices, setPractices] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrganizationId, setSelected] = useState<string | undefined>(
    () => localStorage.getItem(STORAGE_KEY) ?? undefined
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    medplum
      .searchResources('Organization', { identifier: `${SCRIPTSURE_PRACTICE_ID_SYSTEM}|`, _count: '100' })
      .then((orgs) => {
        if (cancelled) {
          return;
        }
        setPractices(orgs);
        // Default selection: keep a valid stored id; else auto-select the sole practice.
        setSelected((current) => {
          if (current && orgs.some((o) => o.id === current)) {
            return current;
          }
          return orgs.length === 1 ? orgs[0].id : undefined;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPractices([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [medplum]);

  const setSelectedOrganizationId = useCallback((id: string | undefined): void => {
    setSelected(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = useMemo<ScriptSurePracticeContextValue>(
    () => ({ practices, selectedOrganizationId, setSelectedOrganizationId, loading }),
    [practices, selectedOrganizationId, setSelectedOrganizationId, loading]
  );

  return <ScriptSurePracticeContext.Provider value={value}>{props.children}</ScriptSurePracticeContext.Provider>;
}

/**
 * Hook returning the current ScriptSure practice selection + setter.
 *
 * @returns The practice context value.
 */
export function useScriptSurePractice(): ScriptSurePracticeContextValue {
  return useContext(ScriptSurePracticeContext);
}

/**
 * Compact practice-location switcher for the app shell. Renders nothing when the
 * prescriber has fewer than two ScriptSure practices (single-practice projects
 * need no picker; the backend resolves the practice automatically).
 *
 * @returns The switcher element, or null.
 */
export function ScriptSurePracticeSwitcher(): JSX.Element | null {
  const { practices, selectedOrganizationId, setSelectedOrganizationId } = useScriptSurePractice();
  if (practices.length < 2) {
    return null;
  }
  return (
    <Select
      aria-label="ScriptSure practice location"
      placeholder="Select location"
      size="xs"
      w={220}
      data={practices.map((o) => ({
        value: o.id as string,
        label: o.name ?? `Practice ${o.id}`,
      }))}
      value={selectedOrganizationId ?? null}
      onChange={(v) => setSelectedOrganizationId(v ?? undefined)}
    />
  );
}
