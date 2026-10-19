// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, MultiSelect, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { ValueSet } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useEligibilityServiceTypes } from '../../hooks/useEligibilityServiceTypes';
import {
  buildEligibilityServiceTypesPatch,
  buildEligibilityServiceTypesValueSet,
  getEligibilityServiceTypeCodes,
} from '../../utils/eligibility';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import { X12_SERVICE_TYPE_CODES } from '../../utils/x12ServiceTypeCodes';

const SERVICE_TYPE_OPTIONS = X12_SERVICE_TYPE_CODES.map((c) => ({ value: c.code, label: `${c.display} (${c.code})` }));

/**
 * Whether two code lists hold the same codes, in any order.
 * @param a - The first list.
 * @param b - The second list.
 * @returns True when they hold the same codes.
 */
function sameCodes(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
}

/**
 * The Billing Settings Eligibility tab: picks the X12 service types every eligibility check asks the payer about.
 * The picker offers the codes both eligibility rails accept and starts from what the practice saved, or `30`
 * (Health Benefit Plan Coverage) alone before anything was saved. Save writes the project-wide ValueSet the
 * eligibility modals read, creating it the first time and patching its codes afterwards.
 * @returns The EligibilityServiceTypeSettings React node.
 */
export function EligibilityServiceTypeSettings(): JSX.Element {
  const medplum = useMedplum();
  const loaded = useEligibilityServiceTypes();
  const [valueSet, setValueSet] = useState<WithId<ValueSet>>();
  const [savedCodes, setSavedCodes] = useState<string[]>();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loaded.loading) {
      return;
    }
    setValueSet(loaded.valueSet);
    setSavedCodes(loaded.codes);
    setSelected(loaded.codes);
  }, [loaded.loading, loaded.valueSet, loaded.codes]);

  const dirty = savedCodes !== undefined && !sameCodes(selected, savedCodes);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const result = valueSet
        ? await medplum.patchResource('ValueSet', valueSet.id, buildEligibilityServiceTypesPatch(selected))
        : await medplum.createResource(buildEligibilityServiceTypesValueSet(selected));
      const codes = getEligibilityServiceTypeCodes(result);
      setValueSet(result);
      setSavedCodes(codes);
      setSelected(codes);
      showSuccessNotification({
        title: 'Eligibility service types saved',
        message: `Eligibility checks now ask about ${codes.length} service ${codes.length === 1 ? 'type' : 'types'}.`,
      });
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Every eligibility check asks the payer about these X12 service types. Health Benefit Plan Coverage (30) is the
        general inquiry every payer answers; add the service types your practice bills for to get benefits specific to
        them.
      </Text>
      <MultiSelect
        label="Service types"
        placeholder="Search by name or code"
        data={SERVICE_TYPE_OPTIONS}
        value={selected}
        onChange={setSelected}
        searchable
        hidePickedOptions
        nothingFoundMessage="No matching service type"
        maxDropdownHeight={280}
        disabled={savedCodes === undefined}
        error={selected.length === 0 ? 'Pick at least one service type' : undefined}
      />
      <Group justify="flex-end">
        <Button
          loading={saving}
          disabled={!dirty || selected.length === 0}
          onClick={() => handleSave().catch(showErrorNotification)}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}
