// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Identifier } from '@medplum/fhirtypes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

export interface UseEPrescribingOrderSetOptions {
  /** Patient to prescribe against. Hook stays idle (no bot call) until set. */
  readonly patientId: string | undefined;
  /** Medplum PlanDefinition id (vendor-neutral). Bot resolves it to the vendor's order set id. */
  readonly planDefinitionId?: string;
  /** Vendor-side order set id, when picked directly (escape hatch when no synced PD exists yet). */
  readonly vendorOrderSetId?: number | string;
  /**
   * Bot payload field name for `vendorOrderSetId`. Wrappers set this to the
   * vendor-specific name the bot expects (e.g. `'scriptSureOrdersetId'`).
   * Defaults to `'vendorOrderSetId'`.
   */
  readonly vendorOrderSetIdField?: string;
  readonly darkmode?: 'on' | 'off';
  readonly appId?: string;
}

export interface UseEPrescribingOrderSetReturn {
  /** Most recent successful URL from the order-set bot, or undefined while loading / on error. */
  readonly url: string | undefined;
  /** True while a bot call is in flight. */
  readonly loading: boolean;
  /** Last error from the bot call, or undefined. */
  readonly error: unknown;
  /**
   * Force a re-fetch using the current options. Useful when wiring
   * `PrescriptionIFrameModal.onRefreshLaunchUrl` so the session token in
   * the returned widget URL is fresh on every modal open.
   */
  readonly refresh: () => Promise<string | undefined>;
}

/**
 * Generic React hook that calls a vendor-agnostic order-set widget URL bot
 * and exposes the resulting URL plus refresh/loading/error state.
 *
 * The hook is a "build a URL" hook (mirrors {@link useEPrescribingIFrame});
 * it does not stamp Medplum resources or create vendor-side resources, so
 * `refresh` is safe to call repeatedly (the bot is naturally idempotent).
 *
 * Re-runs whenever the input options change. In-flight calls are cancelled
 * on input change and on unmount via a per-effect `cancelled` flag, so
 * React 18 Strict Mode double-mount does not surface stale URLs.
 *
 * @param botIdentifier - Bot identifier for the order-set URL bot
 *   (e.g. `SCRIPTSURE_ORDER_SET_BOT`).
 * @param options - Patient, picker (PD or vendor id), iframe styling.
 * @returns `{ url, loading, error, refresh }`.
 */
export function useEPrescribingOrderSet(
  botIdentifier: Identifier,
  options: UseEPrescribingOrderSetOptions
): UseEPrescribingOrderSetReturn {
  const medplum = useMedplum();
  const { patientId, planDefinitionId, vendorOrderSetId, vendorOrderSetIdField, darkmode, appId } = options;
  const vendorIdField = vendorOrderSetIdField ?? 'vendorOrderSetId';

  const [url, setUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  // Latest options snapshot so `refresh` always uses current values without
  // re-creating the callback when only the inputs change.
  const optionsRef = useRef({ patientId, planDefinitionId, vendorOrderSetId, vendorIdField, darkmode, appId });
  optionsRef.current = { patientId, planDefinitionId, vendorOrderSetId, vendorIdField, darkmode, appId };

  const buildPayload = (): Record<string, unknown> | undefined => {
    const o = optionsRef.current;
    if (!o.patientId) {
      return undefined;
    }
    const hasPd = Boolean(o.planDefinitionId);
    const hasVendorId = o.vendorOrderSetId !== undefined && o.vendorOrderSetId !== null && o.vendorOrderSetId !== '';
    if (!hasPd && !hasVendorId) {
      return undefined;
    }
    const payload: Record<string, unknown> = { patientId: o.patientId };
    if (hasPd) {
      payload.planDefinitionId = o.planDefinitionId;
    }
    if (hasVendorId) {
      payload[o.vendorIdField] = o.vendorOrderSetId;
    }
    if (o.darkmode !== undefined) {
      payload.darkmode = o.darkmode;
    }
    if (o.appId !== undefined) {
      payload.appId = o.appId;
    }
    return payload;
  };

  const refresh = useCallback(async (): Promise<string | undefined> => {
    const payload = buildPayload();
    if (!payload) {
      return undefined;
    }
    setLoading(true);
    setError(undefined);
    try {
      const result = await medplum.executeBot(botIdentifier, payload);
      const next = typeof result?.url === 'string' ? result.url : undefined;
      setUrl(next);
      return next;
    } catch (err: unknown) {
      setError(err);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [medplum, botIdentifier]);

  useEffect(() => {
    let cancelled = false;
    const payload = buildPayload();
    if (!payload) {
      // Inputs incomplete — clear any stale URL so the consumer doesn't
      // keep showing a URL that no longer matches the current selection.
      setUrl(undefined);
      setLoading(false);
      setError(undefined);
      return undefined;
    }

    setLoading(true);
    setError(undefined);

    medplum
      .executeBot(botIdentifier, payload)
      .then((result) => {
        if (cancelled) {
          return;
        }
        const next = typeof result?.url === 'string' ? result.url : undefined;
        setUrl(next);
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
  }, [medplum, botIdentifier, patientId, planDefinitionId, vendorOrderSetId, vendorIdField, darkmode, appId]);

  return { url, loading, error, refresh };
}
