// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { useDoseSpotPharmacySearch } from '@medplum/dosespot-react';
import type { PharmacyDialogBaseProps } from '@medplum/react';
import { PharmacyDialog } from '@medplum/react';
import type { JSX } from 'react';

/**
 * DoseSpot-specific pharmacy dialog that composes the generic PharmacyDialog
 * with DoseSpot search and add-to-favorites functionality.
 *
 * @param props - The base pharmacy dialog props (patient, onSubmit, onClose).
 * @returns The DoseSpot pharmacy dialog component.
 */
export function DoseSpotPharmacyDialog(props: PharmacyDialogBaseProps): JSX.Element {
  const { searchPharmacies, addToFavorites } = useDoseSpotPharmacySearch();
  return <PharmacyDialog {...props} onSearch={searchPharmacies} onAddToFavorites={addToFavorites} />;
}
