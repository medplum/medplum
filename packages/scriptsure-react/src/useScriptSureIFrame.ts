// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedicationIFrameOptions } from '@medplum/react-hooks';
import { useMedicationIFrame } from '@medplum/react-hooks';
import { SCRIPTSURE_IFRAME_BOT, SCRIPTSURE_PATIENT_SYNC_BOT } from './common';

export type ScriptSureIFrameOptions = MedicationIFrameOptions;

/**
 * React hook that syncs a patient to ScriptSure and returns the iframe URL.
 *
 * Thin wrapper around the generic {@link useMedicationIFrame} hook,
 * pre-configured with ScriptSure bot identifiers.
 *
 * @param options - Configuration and callback options.
 * @returns The ScriptSure iframe URL, or undefined while loading.
 */
export function useScriptSureIFrame(options: ScriptSureIFrameOptions): string | undefined {
  return useMedicationIFrame(SCRIPTSURE_PATIENT_SYNC_BOT, SCRIPTSURE_IFRAME_BOT, options);
}
