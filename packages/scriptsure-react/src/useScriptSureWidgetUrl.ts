// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { resolveId } from '@medplum/core';
import type { Organization, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback } from 'react';
import { SCRIPTSURE_IFRAME_BOT } from './common';

/**
 * Non-patient ScriptSure reporting widgets. `auditlog` is the session user's own
 * audit trail, which DEA 1311 requires EPCS vendors to make reachable by prescribers.
 */
export type ScriptSureReportWidget = 'auditlog' | 'report';

export interface UseScriptSureWidgetUrlReturn {
  /**
   * Mints a fresh widget URL (new session token) for the current user.
   * @param widget - Reporting widget to open.
   * @param organization - Selected practice location for multi-practice deployments.
   * @returns The UI-agnostic widget URL; the caller appends `darkmode`.
   */
  getWidgetUrl: (widget: ScriptSureReportWidget, organization?: Reference<Organization>) => Promise<string>;
}

/**
 * Returns an on-demand callback that asks `scriptsure-iframe-bot` for a ScriptSure
 * reporting widget URL. Unlike {@link useScriptSureIFrame}, nothing runs on mount.
 *
 * @returns `{ getWidgetUrl }`.
 */
export function useScriptSureWidgetUrl(): UseScriptSureWidgetUrlReturn {
  const medplum = useMedplum();

  const getWidgetUrl = useCallback(
    async (widget: ScriptSureReportWidget, organization?: Reference<Organization>): Promise<string> => {
      const result = (await medplum.executeBot(SCRIPTSURE_IFRAME_BOT, {
        widget,
        organizationId: resolveId(organization),
      })) as { url?: unknown } | undefined;
      if (typeof result?.url !== 'string') {
        throw new Error('Invalid ScriptSure widget response');
      }
      return result.url;
    },
    [medplum]
  );

  return { getWidgetUrl };
}
