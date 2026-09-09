// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { normalizeOperationOutcome } from '@medplum/core';
import type { OperationDefinition, OperationOutcome, Patient } from '@medplum/fhirtypes';
import { HEALTH_GORILLA_SYSTEM } from '@medplum/health-gorilla-core';
import { useMedplum } from '@medplum/react';
import { useEffect, useMemo, useState } from 'react';

export const HEALTH_GORILLA_HIE_P360_IMPORT_ALL_OPERATION_URL =
  'https://medplum.com/fhir/OperationDefinition/health-gorilla-hie-p360-import-all';
export const HEALTH_GORILLA_HIE_P360_IMPORT_SELECTIVE_OPERATION_URL =
  'https://medplum.com/fhir/OperationDefinition/health-gorilla-hie-p360-import-selective';
export const HEALTH_GORILLA_HIE_P360_INGEST_SELECTED_OPERATION_URL =
  'https://medplum.com/fhir/OperationDefinition/health-gorilla-hie-p360-ingest-selected';

interface RequiredHieOperation {
  url: string;
  code: string;
  resourceType: 'Patient' | 'Task';
  instance: boolean;
  type: boolean;
}

const REQUIRED_HIE_OPERATIONS: readonly RequiredHieOperation[] = [
  {
    url: HEALTH_GORILLA_HIE_P360_IMPORT_ALL_OPERATION_URL,
    code: 'health-gorilla-hie-p360-import-all',
    resourceType: 'Patient',
    instance: true,
    type: false,
  },
  {
    url: HEALTH_GORILLA_HIE_P360_IMPORT_SELECTIVE_OPERATION_URL,
    code: 'health-gorilla-hie-p360-import-selective',
    resourceType: 'Patient',
    instance: true,
    type: false,
  },
  {
    url: HEALTH_GORILLA_HIE_P360_INGEST_SELECTED_OPERATION_URL,
    code: 'health-gorilla-hie-p360-ingest-selected',
    resourceType: 'Task',
    instance: false,
    type: true,
  },
];

export interface HealthGorillaHieImportEligibility {
  eligible: boolean;
  hasHealthGorillaIdentifier: boolean;
  loading: boolean;
  outcome?: OperationOutcome;
}

/**
 * Determines whether the HIE import UI is available for a patient.
 *
 * The custom operations must be visible through one linked project. Matching
 * operations owned by the active project are deliberately not sufficient: the
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
    Promise.all(
      REQUIRED_HIE_OPERATIONS.map((required) =>
        medplum.searchResources(
          'OperationDefinition',
          new URLSearchParams({ url: required.url, status: 'active', _count: '20' }),
          { cache: 'reload' }
        )
      )
    )
      .then((operationSets) => {
        if (!cancelled) {
          setState({
            key: eligibilityKey,
            eligible: hasCompleteLinkedOperationSet(operationSets, activeProjectId),
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

function hasCompleteLinkedOperationSet(operationSets: OperationDefinition[][], activeProjectId: string): boolean {
  const eligibleProjects = operationSets.map((operations, index) => {
    const required = REQUIRED_HIE_OPERATIONS[index];
    return new Set(
      operations.flatMap((operation) => {
        const projectId = operation.meta?.project;
        return projectId && projectId !== activeProjectId && isRequiredOperation(operation, required)
          ? [projectId]
          : [];
      })
    );
  });
  const first = eligibleProjects[0];
  return !!first && [...first].some((projectId) => eligibleProjects.every((projects) => projects.has(projectId)));
}

function isRequiredOperation(operation: OperationDefinition, required: RequiredHieOperation): boolean {
  return (
    operation.url === required.url &&
    operation.status === 'active' &&
    operation.kind === 'operation' &&
    operation.code === required.code &&
    operation.instance === required.instance &&
    operation.type === required.type &&
    operation.resource?.includes(required.resourceType) === true
  );
}
