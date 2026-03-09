// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { useScriptSurePharmacySearch } from '@medplum/scriptsure-react';
import type { PharmacyDialogBaseProps } from '@medplum/react';
import { PharmacyDialog } from '@medplum/react';
import type { JSX } from 'react';

/**
 * ScriptSure-specific pharmacy dialog that composes the generic PharmacyDialog
 * with ScriptSure search and add-to-favorites functionality.
 *
 * @param props - The base pharmacy dialog props (patient, onSubmit, onClose).
 * @returns The ScriptSure pharmacy dialog component.
 */
export function ScriptSurePharmacyDialog(props: PharmacyDialogBaseProps): JSX.Element {
  const { searchPharmacies, addToFavorites } = useScriptSurePharmacySearch();
  return <PharmacyDialog {...props} onSearch={searchPharmacies} onAddToFavorites={addToFavorites} />;
}
