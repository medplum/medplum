// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, MultiSelect, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { ValueSet } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useEligibilityServiceTypes } from '../../hooks/useEligibilityServiceTypes';
import type { ServiceType } from '../../utils/eligibility';
import {
  buildEligibilityServiceTypesPatch,
  buildEligibilityServiceTypesValueSet,
  fetchX12ServiceTypes,
  formatServiceTypeLabel,
  getEligibilityServiceTypes,
  pickServiceTypes,
} from '../../utils/eligibility';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';

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
 * The picker offers every service type in the shared CodeSystem, loaded from the server, and starts from what the
 * practice saved, or Health Benefit Plan Coverage alone before anything was saved. A saved service type the
 * CodeSystem no longer lists stays offered so its pick keeps a label. Save writes the project-wide ValueSet the
 * eligibility modals read, creating it the first time and patching its service types afterwards.
 * @returns The EligibilityServiceTypeSettings React node.
 */
export function EligibilityServiceTypeSettings(): JSX.Element {
  const medplum = useMedplum();
  const loaded = useEligibilityServiceTypes();
  const [allServiceTypes, setAllServiceTypes] = useState<ServiceType[]>();
  const [valueSet, setValueSet] = useState<WithId<ValueSet>>();
  const [savedServiceTypes, setSavedServiceTypes] = useState<ServiceType[]>();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchX12ServiceTypes(medplum).then(setAllServiceTypes).catch(showErrorNotification);
  }, [medplum]);

  useEffect(() => {
    if (loaded.loading) {
      return;
    }
    setValueSet(loaded.valueSet);
    setSavedServiceTypes(loaded.serviceTypes);
    setSelected(loaded.serviceTypes.map((serviceType) => serviceType.code));
  }, [loaded.loading, loaded.valueSet, loaded.serviceTypes]);

  const serviceTypes = useMemo(() => {
    const known = allServiceTypes ?? [];
    const unlisted = (savedServiceTypes ?? []).filter((saved) => !known.some((s) => s.code === saved.code));
    return [...known, ...unlisted];
  }, [allServiceTypes, savedServiceTypes]);

  const data = useMemo(
    () => serviceTypes.map((serviceType) => ({ value: serviceType.code, label: formatServiceTypeLabel(serviceType) })),
    [serviceTypes]
  );

  const savedCodes = savedServiceTypes?.map((serviceType) => serviceType.code);
  const dirty = savedCodes !== undefined && !sameCodes(selected, savedCodes);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const picked = pickServiceTypes(serviceTypes, selected);
      const result = valueSet
        ? await medplum.patchResource('ValueSet', valueSet.id, buildEligibilityServiceTypesPatch(picked))
        : await medplum.createResource(buildEligibilityServiceTypesValueSet(picked));
      const saved = getEligibilityServiceTypes(result);
      setValueSet(result);
      setSavedServiceTypes(saved);
      setSelected(saved.map((serviceType) => serviceType.code));
      showSuccessNotification({
        title: 'Eligibility service types saved',
        message: `Eligibility checks now ask about ${saved.length} service ${saved.length === 1 ? 'type' : 'types'}.`,
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
        data={data}
        value={selected}
        onChange={setSelected}
        searchable
        hidePickedOptions
        nothingFoundMessage={allServiceTypes ? 'No matching service type' : 'Loading service types...'}
        maxDropdownHeight={280}
        disabled={savedServiceTypes === undefined}
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
