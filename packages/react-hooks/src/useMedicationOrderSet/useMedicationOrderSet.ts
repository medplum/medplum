// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedicationOrderSetRequest } from '@medplum/core';
import {
  INVALID_MEDICATION_ORDER_SET_RESPONSE,
  isResource,
  medicationOrderSetRequestToParameters,
  parametersToMedicationOrderSetResponse,
} from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

export interface UseMedicationOrderSetOptions {
  /** Patient to prescribe against. Hook stays idle (no operation call) until set. */
  readonly patientId: string | undefined;
  /** Medplum PlanDefinition id (vendor-neutral). Bot resolves it to the vendor's order set id. */
  readonly planDefinitionId?: string;
  /** Vendor-side order set id, when picked directly (escape hatch when no synced PD exists yet). */
  readonly vendorOrderSetId?: number | string;
  readonly appId?: string;
}

export interface UseMedicationOrderSetReturn {
  /** Most recent successful URL from the order-set operation, or undefined while loading / on error. */
  readonly url: string | undefined;
  /** True while a request is in flight. */
  readonly loading: boolean;
  /** Last error from the operation call, or undefined. */
  readonly error: unknown;
  /**
   * Force a re-fetch using the current options. Useful when wiring
   * `PrescriptionIFrameModal.onRefreshLaunchUrl` so the session token in
   * the returned widget URL is fresh on every modal open.
   */
  readonly refresh: () => Promise<string | undefined>;
}

/**
 * Vendor-neutral React hook that calls the `$order-set-url` custom FHIR
 * operation and exposes the resulting iframe URL plus refresh/loading/error
 * state.
 *
 * Hits the project-scoped operation whose backing bot is chosen at deploy time
 * via an `OperationDefinition` resource carrying the
 * `operationDefinition-implementation` extension — see
 * [bot operations docs](https://www.medplum.com/docs/bots/custom-fhir-operations).
 * The server's `tryCustomOperation` dispatch handles the OD → Bot lookup, so
 * projects can swap vendors (ScriptSure today, DoseSpot tomorrow) by deploying
 * a different bot under the same operation code.
 *
 * - URL: `POST /fhir/R4/PlanDefinition/$order-set-url`
 * - Body: `Parameters` with `patientId` + (`planDefinitionId` XOR `vendorOrderSetId`) + optional `appId`.
 * - Returns: `Parameters` whose `launchUrl` is exposed as `url` on the hook.
 *
 * The hook is a "build a URL" hook (mirrors {@link useMedicationIFrame}); it
 * does not stamp Medplum resources or create vendor-side resources, so
 * `refresh` is safe to call repeatedly (the operation is naturally idempotent).
 *
 * Re-runs whenever the input options change. In-flight calls are cancelled on
 * input change and on unmount via a per-effect `cancelled` flag, so React 18
 * Strict Mode double-mount does not surface stale URLs.
 *
 * @param options - Patient, picker (PD or vendor id), and optional appId.
 * @returns `{ url, loading, error, refresh }`.
 */
export function useMedicationOrderSet(options: UseMedicationOrderSetOptions): UseMedicationOrderSetReturn {
  const medplum = useMedplum();
  const { patientId, planDefinitionId, vendorOrderSetId, appId } = options;

  const [url, setUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  // Latest options snapshot so `refresh` always uses current values without
  // re-creating the callback when only the inputs change.
  const optionsRef = useRef({ patientId, planDefinitionId, vendorOrderSetId, appId });
  optionsRef.current = { patientId, planDefinitionId, vendorOrderSetId, appId };

  const buildRequest = (): MedicationOrderSetRequest | undefined => {
    const o = optionsRef.current;
    if (!o.patientId) {
      return undefined;
    }
    const hasPd = Boolean(o.planDefinitionId);
    const hasVendorId = o.vendorOrderSetId !== undefined && o.vendorOrderSetId !== null && o.vendorOrderSetId !== '';
    if (!hasPd && !hasVendorId) {
      return undefined;
    }
    const req: MedicationOrderSetRequest = {
      patientId: o.patientId,
      planDefinitionId: hasPd ? o.planDefinitionId : undefined,
      vendorOrderSetId: hasVendorId ? o.vendorOrderSetId : undefined,
      appId: o.appId,
    };
    return req;
  };

  const callOperation = useCallback(
    async (req: MedicationOrderSetRequest): Promise<string | undefined> => {
      const operationUrl = medplum.fhirUrl('PlanDefinition', '$order-set-url');
      const body = medicationOrderSetRequestToParameters(req);
      const response = await medplum.post(operationUrl, body);
      if (!isResource<Parameters>(response, 'Parameters')) {
        throw new Error(INVALID_MEDICATION_ORDER_SET_RESPONSE);
      }
      const decoded = parametersToMedicationOrderSetResponse(response);
      return decoded.launchUrl;
    },
    [medplum]
  );

  const refresh = useCallback(async (): Promise<string | undefined> => {
    const req = buildRequest();
    if (!req) {
      return undefined;
    }
    setLoading(true);
    setError(undefined);
    try {
      const next = await callOperation(req);
      setUrl(next);
      return next;
    } catch (err: unknown) {
      setError(err);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [callOperation]);

  useEffect(() => {
    let cancelled = false;
    const req = buildRequest();
    if (!req) {
      // Inputs incomplete — clear any stale URL so the consumer doesn't
      // keep showing a URL that no longer matches the current selection.
      setUrl(undefined);
      setLoading(false);
      setError(undefined);
      return undefined;
    }

    setLoading(true);
    setError(undefined);

    callOperation(req)
      .then((next) => {
        if (!cancelled) {
          setUrl(next);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err);
          setUrl(undefined);
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
  }, [callOperation, patientId, planDefinitionId, vendorOrderSetId, appId]);

  return { url, loading, error, refresh };
}
