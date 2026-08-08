// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Checkbox, ScrollArea, Stack, Table, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getDisplayString } from '@medplum/core';
import type { BundleEntry, Patient, Reference, Resource } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { IconDownload } from '@tabler/icons-react';
import type { JSX } from 'react';
import { PatientDestinationCard } from './PatientDestinationCard';
import { getResourceTypeLabel, getSmartHealthLinkBundleEntryKey } from './SmartHealthLinkImport.utils';
import { StepActions } from './StepActions';

export interface SmartHealthLinkRecordsStepProps {
  /**
   * The Patient carried by the shared bundle, and the destination when `createNewPatient` is set.
   * The flow passes the inline resource — it only exists in the bundle, not on this server — so the
   * reference form is accepted for consistency but would not resolve.
   */
  readonly sharedPatient: Patient | Reference<Patient>;
  readonly createNewPatient: boolean;
  readonly selectedPatient: WithId<Patient> | undefined;
  readonly entries: BundleEntry[];
  readonly selectedKeys: Set<string>;
  readonly onToggleEntry: (key: string, checked: boolean) => void;
  readonly onToggleAll: (checked: boolean) => void;
  readonly allSelected: boolean;
  readonly someSelected: boolean;
  readonly importButtonLabel: string;
  readonly importing: boolean;
  readonly onImport: () => void;
}

/**
 * Step 3: confirm the destination and pick which shared records to import.
 * @param props - The SmartHealthLinkRecordsStep React props.
 * @returns The SmartHealthLinkRecordsStep React node.
 */
export function SmartHealthLinkRecordsStep(props: SmartHealthLinkRecordsStepProps): JSX.Element | null {
  const {
    createNewPatient,
    selectedPatient,
    entries,
    selectedKeys,
    onToggleEntry,
    onToggleAll,
    allSelected,
    someSelected,
    importButtonLabel,
    importing,
    onImport,
  } = props;
  const sharedPatient = useResource<Patient>(props.sharedPatient);

  const destinationPatient = createNewPatient ? sharedPatient : selectedPatient;
  if (!destinationPatient) {
    return null;
  }

  const selectedCount = entries.filter((entry) => {
    const key = getSmartHealthLinkBundleEntryKey(entry);
    return !!key && selectedKeys.has(key);
  }).length;

  return (
    <>
      <Stack gap="md">
        <div>
          <Text fz="md" fw={800}>
            Select Records to Import to {createNewPatient ? 'New' : 'Existing'} Profile
          </Text>
          {!createNewPatient && (
            <Text size="sm" c="dimmed">
              Existing records will automatically be excluded from the import.
            </Text>
          )}
        </div>
        <PatientDestinationCard patient={destinationPatient} selected showNewPatientBadge={createNewPatient} />
        <ScrollArea.Autosize mah={320}>
          <Table
            horizontalSpacing="sm"
            verticalSpacing="xs"
            highlightOnHover
            style={{ borderBottom: '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))' }}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 36 }}>
                  <Checkbox
                    aria-label="Select all resources"
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={(event) => onToggleAll(event.currentTarget.checked)}
                  />
                </Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Details</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {entries.map((entry) => {
                const key = getSmartHealthLinkBundleEntryKey(entry) as string;
                const resource = entry.resource as Resource;
                return (
                  <Table.Tr key={key}>
                    <Table.Td>
                      <Checkbox
                        aria-label={`Select ${getDisplayString(resource)}`}
                        checked={selectedKeys.has(key)}
                        onChange={(event) => onToggleEntry(key, event.currentTarget.checked)}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{getResourceTypeLabel(resource.resourceType)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={400}>
                        {getDisplayString(resource)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        <Text size="sm" c="dimmed">
          {selectedCount} of {entries.length} selected
        </Text>
      </Stack>

      <StepActions>
        <Button
          fullWidth
          leftSection={<IconDownload size={16} />}
          loading={importing}
          disabled={selectedCount === 0}
          onClick={onImport}
        >
          {importButtonLabel}
        </Button>
      </StepActions>
    </>
  );
}
