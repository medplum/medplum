// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Seeds and returns the demo FHIR resources from the Medplum server.
 *
 * All resource creation uses FHIR conditional create (`If-None-Exist`) inside a
 * transaction bundle, so the operation is fully idempotent — safe to call
 * concurrently (e.g. React StrictMode double-invocation) and on every page load.
 */

import type { Bundle, BundleEntry, Condition, Patient, Questionnaire } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import {
  DEMO_CONDITIONS,
  DEMO_PATIENT,
  DEMO_PATIENT_IDENTIFIER,
  DEMO_QUESTIONNAIRE,
  QUESTIONNAIRE_CANONICAL_URL,
} from '../data/demoResources';
import type { CodingWithTranslation } from '../data/demoResources';

export const DEMO_TAG = {
  system: 'https://medplum.com/demo-tags',
  code: 'multilingual-demo',
};

const TAG_PARAM = `${DEMO_TAG.system}|${DEMO_TAG.code}`;
const PATIENT_IF_NONE_EXIST = `identifier=${DEMO_PATIENT_IDENTIFIER.system}|${DEMO_PATIENT_IDENTIFIER.value}`;
const QUESTIONNAIRE_IF_NONE_EXIST = `url=${QUESTIONNAIRE_CANONICAL_URL}`;

export interface DemoData {
  patient: Patient | undefined;
  questionnaire: Questionnaire | undefined;
  /** Conditions cast to include `_display` shadow elements. */
  conditions: (Condition & { code?: { coding?: CodingWithTranslation[] } })[];
  loading: boolean;
  error: Error | undefined;
}

export function useDemoData(): DemoData {
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient | undefined>();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | undefined>();
  const [conditions, setConditions] = useState<DemoData['conditions']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    let cancelled = false;

    async function seed(): Promise<void> {
      setLoading(true);
      setError(undefined);

      try {
        // ----------------------------------------------------------------
        // Step 1: Patient + Questionnaire via transaction with ifNoneExist.
        // The server creates each resource only if the search condition
        // matches nothing — safe to call concurrently.
        // ----------------------------------------------------------------
        const initBundle: Bundle = {
          resourceType: 'Bundle',
          type: 'transaction',
          entry: [
            {
              fullUrl: 'urn:uuid:demo-patient',
              resource: { ...DEMO_PATIENT, meta: { tag: [DEMO_TAG] } },
              request: { method: 'POST', url: 'Patient', ifNoneExist: PATIENT_IF_NONE_EXIST },
            },
            {
              fullUrl: 'urn:uuid:demo-questionnaire',
              resource: { ...(DEMO_QUESTIONNAIRE as Questionnaire), meta: { tag: [DEMO_TAG] } },
              request: { method: 'POST', url: 'Questionnaire', ifNoneExist: QUESTIONNAIRE_IF_NONE_EXIST },
            },
          ],
        };

        await medplum.executeBatch(initBundle);

        if (cancelled) {
          return;
        }

        // Re-fetch by their stable identifiers to get the authoritative IDs.
        const [p, q] = await Promise.all([
          medplum.searchOne('Patient', {
            identifier: `${DEMO_PATIENT_IDENTIFIER.system}|${DEMO_PATIENT_IDENTIFIER.value}`,
          }),
          medplum.searchOne('Questionnaire', { url: QUESTIONNAIRE_CANONICAL_URL }),
        ]);

        if (cancelled) {
          return;
        }

        if (!p || !q) {
          throw new Error('Demo resources were not found after seeding.');
        }

        setPatient(p);
        setQuestionnaire(q);

        // ----------------------------------------------------------------
        // Step 2: Conditions — one conditional-create per condition code.
        // ----------------------------------------------------------------
        const conditionEntries: BundleEntry[] = DEMO_CONDITIONS.map((c) => {
          const code = c.code?.coding?.[0];
          const ifNoneExist = [
            `code=${code?.system ?? ''}|${code?.code ?? ''}`,
            `subject=Patient/${p.id}`,
            `_tag=${TAG_PARAM}`,
          ].join('&');

          return {
            resource: {
              ...c,
              subject: { reference: `Patient/${p.id}` },
              meta: { tag: [DEMO_TAG] },
            },
            request: { method: 'POST', url: 'Condition', ifNoneExist },
          };
        });

        await medplum.executeBatch({ resourceType: 'Bundle', type: 'transaction', entry: conditionEntries });

        if (cancelled) {
          return;
        }

        const seededConditions = await medplum.searchResources('Condition', {
          subject: `Patient/${p.id}`,
          _tag: TAG_PARAM,
        });

        if (!cancelled) {
          setConditions(seededConditions);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    seed().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [medplum]);

  return { patient, questionnaire, conditions, loading, error };
}

/**
 * Cast a Coding to include the `_display` shadow element for translation lookups.
 * @param coding - The Coding object to cast.
 * @returns The same object typed as CodingWithTranslation.
 */
export function getCodingWithTranslation(coding: unknown): CodingWithTranslation {
  return coding as CodingWithTranslation;
}
