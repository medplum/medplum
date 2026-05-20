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

  // `refresh()` and the input-driven effect share a monotonically-incrementing
  // run id (`runIdRef`). Every fetch — whether kicked off by the effect or by
  // a `refresh()` call — captures its own `myRunId` at start, and only writes
  // state if `runIdRef.current === myRunId` when the fetch resolves. The
  // effect's per-run `cancelled` flag also short-circuits on unmount / deps
  // change. This gives `refresh()` the same cancellation semantics as the
  // effect without the act+await deadlock that a resolver-queue approach
  // creates (a refresh promise that depends on a nonce-triggered effect
  // re-render cannot resolve while React's `act` is awaiting the refresh).
  // (PR https://github.com/medplum/medplum/pull/8999#discussion_r3277116116)
  const runIdRef = useRef(0);

  const refresh = useCallback(async (): Promise<string | undefined> => {
    const req = buildRequest();
    if (!req) {
      return undefined;
    }
    runIdRef.current += 1;
    const myRunId = runIdRef.current;
    setLoading(true);
    setError(undefined);
    try {
      const next = await callOperation(req);
      if (runIdRef.current !== myRunId) {
        // A newer run started while we were in flight — drop the result so
        // neither the state nor the returned promise can clobber the newer
        // fetch's URL.
        return undefined;
      }
      setUrl(next);
      return next;
    } catch (err: unknown) {
      if (runIdRef.current === myRunId) {
        setError(err);
        setUrl(undefined);
      }
      return undefined;
    } finally {
      if (runIdRef.current === myRunId) {
        setLoading(false);
      }
    }
  }, [callOperation]);

  useEffect(() => {
    let cancelled = false;
    const req = buildRequest();
    if (!req) {
      // Inputs incomplete — clear any stale URL so the consumer doesn't
      // keep showing a URL that no longer matches the current selection.
      runIdRef.current += 1;
      setUrl(undefined);
      setLoading(false);
      setError(undefined);
      return undefined;
    }

    runIdRef.current += 1;
    const myRunId = runIdRef.current;
    setLoading(true);
    setError(undefined);

    callOperation(req)
      .then((next) => {
        if (cancelled || runIdRef.current !== myRunId) {
          return;
        }
        setUrl(next);
      })
      .catch((err: unknown) => {
        if (cancelled || runIdRef.current !== myRunId) {
          return;
        }
        setError(err);
        setUrl(undefined);
      })
      .finally(() => {
        if (!cancelled && runIdRef.current === myRunId) {
          setLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [callOperation, patientId, planDefinitionId, vendorOrderSetId, appId]);

  return { url, loading, error, refresh };
}
