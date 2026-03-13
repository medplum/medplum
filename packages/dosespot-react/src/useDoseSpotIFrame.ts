// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useEPrescribingIFrame } from '@medplum/react-hooks';
import type { EPrescribingIFrameOptions } from '@medplum/react-hooks';
import { DOSESPOT_IFRAME_BOT, DOSESPOT_PATIENT_SYNC_BOT } from './common';

export type DoseSpotIFrameOptions = EPrescribingIFrameOptions;

/**
 * React hook that syncs a patient to DoseSpot and returns the iframe URL.
 *
 * Thin wrapper around the generic {@link useEPrescribingIFrame} hook,
 * pre-configured with DoseSpot bot identifiers.
 *
 * @param options - Configuration and callback options.
 * @returns The DoseSpot iframe URL, or undefined while loading.
 */
export function useDoseSpotIFrame(options: DoseSpotIFrameOptions): string | undefined {
  return useEPrescribingIFrame(DOSESPOT_PATIENT_SYNC_BOT, DOSESPOT_IFRAME_BOT, options);
}
