// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Organization, Practitioner, PractitionerRole } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SCRIPTSURE_PRACTICE_ID_SYSTEM } from './common';

const STORAGE_KEY = 'medplum.scriptsure.selectedPracticeOrganization';

/** The current ScriptSure practice-location selection for the signed-in prescriber. */
export interface ScriptSurePracticeContextValue {
  /**
   * The prescriber's ScriptSure practice `Organization`s — discovered from their
   * own affiliations (`PractitionerRole.organization` + `ProjectMembership.access`
   * organization parameters), filtered to those carrying a `practice-id` identifier.
   * Never the project-wide list.
   */
  readonly practices: Organization[];
  /** The selected practice Organization id (bare id, passed to bots as `organizationId`), or undefined. */
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

function addOrganizationReference(refs: Set<string>, reference: string | undefined): void {
  if (reference?.startsWith('Organization/')) {
    refs.add(reference);
  }
}

function hasPracticeIdentifier(org: Organization): boolean {
  return Boolean(org.identifier?.some((i) => i.system === SCRIPTSURE_PRACTICE_ID_SYSTEM && i.value));
}

/**
 * Resolves the signed-in prescriber's `Practitioner.id` from the current profile,
 * whether the profile is a `Practitioner` or a `PractitionerRole`.
 *
 * @param profile - The current Medplum profile resource.
 * @returns The Practitioner id, or undefined when it cannot be resolved.
 */
function resolvePractitionerId(profile: Practitioner | PractitionerRole | undefined): string | undefined {
  if (profile?.resourceType === 'Practitioner') {
    return profile.id;
  }
  if (profile?.resourceType === 'PractitionerRole') {
    return profile.practitioner?.reference?.slice('Practitioner/'.length) || undefined;
  }
  return undefined;
}

/**
 * Provides the signed-in prescriber's current ScriptSure practice-location
 * selection, discovered from **their own affiliations** — mirroring the server's
 * multi-practice resolver so the UI never offers a practice the prescriber is not
 * a member of.
 *
 * Discovery: active `PractitionerRole.organization` references for the current
 * `Practitioner` plus any `ProjectMembership.access[].parameter` named
 * `organization`, resolved to `Organization`s and filtered to those carrying a
 * `practice-id` identifier. The sole practice is auto-selected; a previously used
 * selection is restored only when it is still in the affiliation set.
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

    const loadAffiliatedPractices = async (): Promise<Organization[]> => {
      const profile = medplum.getProfile() as Practitioner | PractitionerRole | undefined;
      const practitionerId = resolvePractitionerId(profile);
      const references = new Set<string>();

      if (practitionerId) {
        const roles = await medplum.searchResources('PractitionerRole', {
          practitioner: `Practitioner/${practitionerId}`,
          _count: '100',
        });
        for (const role of roles) {
          // `active` is not a standard R4 PractitionerRole search param — filter in code.
          if (role.active !== false) {
            addOrganizationReference(references, role.organization?.reference);
          }
        }
      }

      const membership = medplum.getProjectMembership();
      for (const access of membership?.access ?? []) {
        for (const param of access.parameter ?? []) {
          if (param.name === 'organization') {
            addOrganizationReference(references, param.valueReference?.reference);
          }
        }
      }

      const orgs = await Promise.all(
        [...references].map((reference) => medplum.readReference<Organization>({ reference }))
      );
      const seen = new Set<string>();
      const result: Organization[] = [];
      for (const org of orgs) {
        if (org.id && !seen.has(org.id) && hasPracticeIdentifier(org)) {
          seen.add(org.id);
          result.push(org);
        }
      }
      return result;
    };

    loadAffiliatedPractices()
      .then((orgs) => {
        if (cancelled) {
          return;
        }
        setPractices(orgs);
        // Default: keep a stored id only if it is still an affiliation; else the sole practice.
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
