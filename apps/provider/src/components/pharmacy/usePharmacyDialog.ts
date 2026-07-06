// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { PharmacyDialogBaseProps } from '@medplum/react';
import { useMedplum } from '@medplum/react';
import type { ComponentType } from 'react';
import { hasDoseSpotIdentifier, hasScriptSureIdentifier } from '../utils';
import { DoseSpotPharmacyDialog } from './DoseSpotPharmacyDialog';
import { ScriptSurePharmacyDialog } from './ScriptSurePharmacyDialog';

/**
 * Returns the appropriate pharmacy dialog component based on which
 * e-prescribing integration is active for the current user.
 *
 * - ScriptSure takes priority when both are present.
 * - Returns undefined when neither integration is configured.
 *
 * @returns The pharmacy dialog component, or undefined if no integration is active.
 */
export function usePharmacyDialog(): ComponentType<PharmacyDialogBaseProps> | undefined {
  const medplum = useMedplum();
  const membership = medplum.getProjectMembership();

  if (hasScriptSureIdentifier(membership)) {
    return ScriptSurePharmacyDialog;
  }
  if (hasDoseSpotIdentifier(membership)) {
    return DoseSpotPharmacyDialog;
  }
  return undefined;
}
