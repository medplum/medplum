// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Checkbox, Stack, Text } from '@mantine/core';
import type { PharmacyDialogBaseProps, PharmacySearchFieldPlaceholders } from '@medplum/react';
import { PharmacyDialog } from '@medplum/react';
import type { ScriptSurePharmacySearchParams, ScriptSurePharmacySpecialty } from '@medplum/scriptsure-react';
import {
  SCRIPTSURE_DEFAULT_PHARMACY_SPECIALTIES,
  SCRIPTSURE_PHARMACY_SPECIALTY_OPTIONS,
  useScriptSurePharmacySearch,
} from '@medplum/scriptsure-react';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';

/** ScriptSure search-field placeholders reflecting SureScripts directory constraints. */
const SCRIPTSURE_SEARCH_PLACEHOLDERS: PharmacySearchFieldPlaceholders = {
  name: 'Pharmacy name (e.g. CVS)',
  city: 'City',
  state: 'State (2 letters, e.g. CA)',
  zip: 'ZIP code (5 digits)',
  phoneOrFax: 'Phone or fax (digits only)',
  address: 'Street address',
  ncpdpID: 'NCPDP ID (7 digits)',
};

interface ScriptSureSpecialtyFiltersProps {
  readonly value: ScriptSurePharmacySpecialty[];
  readonly onChange: (value: ScriptSurePharmacySpecialty[]) => void;
}

function ScriptSureSpecialtyFilters({ value, onChange }: ScriptSureSpecialtyFiltersProps): JSX.Element {
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Pharmacy categories
      </Text>
      <Checkbox.Group value={value} onChange={(next) => onChange(next as ScriptSurePharmacySpecialty[])}>
        <Stack gap={6}>
          {SCRIPTSURE_PHARMACY_SPECIALTY_OPTIONS.map((option) => (
            <Checkbox key={option.value} value={option.value} label={option.label} />
          ))}
        </Stack>
      </Checkbox.Group>
    </Stack>
  );
}

/**
 * ScriptSure-specific pharmacy dialog with SureScripts specialty category filters.
 *
 * Composes the generic {@link PharmacyDialog} with ScriptSure bot identifiers and
 * passes `specialties` to POST /v3/pharmacy/search (e.g. Retail + ZIP for nearby pickers).
 *
 * @param props - The base pharmacy dialog props (patient, onSubmit, onClose).
 * @returns The ScriptSure pharmacy dialog component.
 */
export function ScriptSurePharmacyDialog(props: PharmacyDialogBaseProps): JSX.Element {
  const { searchPharmacies, addToFavorites } = useScriptSurePharmacySearch();
  const [specialties, setSpecialties] = useState<ScriptSurePharmacySpecialty[]>([
    ...SCRIPTSURE_DEFAULT_PHARMACY_SPECIALTIES,
  ]);

  const getExtraSearchParams = useCallback(
    (): Pick<ScriptSurePharmacySearchParams, 'specialties'> => (specialties.length > 0 ? { specialties } : {}),
    [specialties]
  );

  const handleSearch = useCallback(
    (params: ScriptSurePharmacySearchParams) => searchPharmacies(params),
    [searchPharmacies]
  );

  const specialtyFilters = useMemo(
    () => <ScriptSureSpecialtyFilters value={specialties} onChange={setSpecialties} />,
    [specialties]
  );

  return (
    <PharmacyDialog
      {...props}
      onSearch={handleSearch}
      onAddToFavorites={addToFavorites}
      getExtraSearchParams={getExtraSearchParams}
      renderBeforeSearchButton={specialtyFilters}
      searchPlaceholders={SCRIPTSURE_SEARCH_PLACEHOLDERS}
    />
  );
}
