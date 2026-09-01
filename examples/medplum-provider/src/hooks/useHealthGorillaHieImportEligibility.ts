// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { normalizeOperationOutcome } from '@medplum/core';
import type { OperationDefinition, OperationOutcome, Patient } from '@medplum/fhirtypes';
import { HEALTH_GORILLA_SYSTEM } from '@medplum/health-gorilla-core';
import { useMedplum } from '@medplum/react';
import { useEffect, useMemo, useState } from 'react';

export const HEALTH_GORILLA_HIE_P360_OPERATION_URL =
  'https://medplum.com/fhir/OperationDefinition/health-gorilla-hie-p360';
const HEALTH_GORILLA_HIE_P360_OPERATION_CODE = 'health-gorilla-hie-p360';

export interface HealthGorillaHieImportEligibility {
  eligible: boolean;
  hasHealthGorillaIdentifier: boolean;
  loading: boolean;
  outcome?: OperationOutcome;
}

/**
 * Determines whether the HIE import UI is available for a patient.
 *
 * The custom operation must be visible through a linked project. A matching
 * operation owned by the active project is deliberately not sufficient: the
 * shared HIE project owns the production Patient360 capability.
 *
 * @param patient - Patient whose Health Gorilla identity will be synchronized.
 * @returns Current eligibility and any failed capability-check outcome.
 */
export function useHealthGorillaHieImportEligibility(patient: Patient | undefined): HealthGorillaHieImportEligibility {
  const medplum = useMedplum();
  const activeProjectId = medplum.getProject()?.id;
  const hasHealthGorillaIdentifier = useMemo(
    () =>
      patient?.identifier?.some(
        (identifier) => identifier.system === HEALTH_GORILLA_SYSTEM && !!identifier.value?.trim()
      ) ?? false,
    [patient?.identifier]
  );
  const eligibilityKey = `${patient?.id ?? ''}|${activeProjectId ?? ''}|${hasHealthGorillaIdentifier}`;
  const canCheckOperation = !!patient?.id && hasHealthGorillaIdentifier && !!activeProjectId;
  const [state, setState] = useState<
    Omit<HealthGorillaHieImportEligibility, 'hasHealthGorillaIdentifier'> & { key: string }
  >({
    key: eligibilityKey,
    eligible: false,
    loading: canCheckOperation,
  });

  useEffect(() => {
    if (!canCheckOperation) {
      return undefined;
    }

    let cancelled = false;
    const search = new URLSearchParams({
      url: HEALTH_GORILLA_HIE_P360_OPERATION_URL,
      status: 'active',
      _count: '20',
    });

    medplum
      .searchResources('OperationDefinition', search, { cache: 'reload' })
      .then((operations) => {
        if (!cancelled) {
          setState({
            key: eligibilityKey,
            eligible: operations.some((operation) => isLinkedPatientInstanceOperation(operation, activeProjectId)),
            loading: false,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            key: eligibilityKey,
            eligible: false,
            loading: false,
            outcome: normalizeOperationOutcome(err),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, canCheckOperation, eligibilityKey, medplum]);

  if (state.key !== eligibilityKey) {
    return { eligible: false, hasHealthGorillaIdentifier, loading: canCheckOperation };
  }
  return { ...state, hasHealthGorillaIdentifier };
}

function isLinkedPatientInstanceOperation(operation: OperationDefinition, activeProjectId: string): boolean {
  return (
    operation.url === HEALTH_GORILLA_HIE_P360_OPERATION_URL &&
    operation.status === 'active' &&
    operation.kind === 'operation' &&
    operation.code === HEALTH_GORILLA_HIE_P360_OPERATION_CODE &&
    operation.instance &&
    operation.resource?.includes('Patient') === true &&
    !!operation.meta?.project &&
    operation.meta.project !== activeProjectId
  );
}
