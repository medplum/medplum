// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Card, Flex, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { createReference, HTTP_HL7_ORG } from '@medplum/core';
import { ChargeItem, ChargeItemDefinition, CodeableConcept, Encounter, Patient } from '@medplum/fhirtypes';
import { CodeableConceptInput, AsyncAutocomplete, useMedplum } from '@medplum/react';
import { IconPlus } from '@tabler/icons-react';
import { JSX, useCallback, useEffect, useState } from 'react';
import { applyChargeItemDefinition, calculateTotalPrice } from '../../utils/chargeitems';
import { showErrorNotification } from '../../utils/notifications';
import ChargeItemPanel from './ChargeItemPanel';

interface ChargeItemListProps {
  chargeItems: ChargeItem[];
  updateChargeItems: (chargeItems: ChargeItem[]) => void;
  patient: Patient;
  encounter: Encounter;
}

export const ChargeItemList = (props: ChargeItemListProps): JSX.Element => {
  const { chargeItems, updateChargeItems, patient, encounter } = props;
  const [chargeItemsState, setChargeItemsState] = useState<ChargeItem[]>(chargeItems);
  const [opened, { open, close }] = useDisclosure(false);
  const medplum = useMedplum();

  useEffect(() => {
    setChargeItemsState(chargeItems);
  }, [chargeItems]);

  const updateChargeItemList = useCallback(
    async (updatedChargeItem: ChargeItem): Promise<void> => {
      const updatedChargeItems = chargeItemsState.map((item) =>
        item.id === updatedChargeItem.id ? updatedChargeItem : item
      );
      updateChargeItems(updatedChargeItems);
    },
    [chargeItemsState, updateChargeItems]
  );

  const deleteChargeItem = useCallback(
    async (chargeItem: ChargeItem): Promise<void> => {
      const updatedChargeItems = chargeItemsState.filter((item) => item.id !== chargeItem.id);
      updateChargeItems(updatedChargeItems);
    },
    [chargeItemsState, updateChargeItems]
  );

  const addChargeItem = useCallback(async (): Promise<void> => {
    open();
  }, [open]);

  const handleAddChargeItem = useCallback(
    async (
      cptCode: CodeableConcept | undefined,
      chargeItemDefinition: ChargeItemDefinition | undefined
    ): Promise<void> => {
      if (!cptCode || !chargeItemDefinition) {
        showErrorNotification('Please select both CPT code and charge item definition');
        return;
      }

      try {
        const newChargeItem: ChargeItem = {
          resourceType: 'ChargeItem',
          status: 'planned',
          subject: createReference(patient),
          context: createReference(encounter),
          occurrenceDateTime: new Date().toISOString(),
          extension: [
            {
              url: `${HTTP_HL7_ORG}/fhir/uv/order-catalog/StructureDefinition/ServiceBillingCode`,
              valueCodeableConcept: cptCode,
            },
          ],
          code: cptCode,
          quantity: {
            value: 1,
          },
          definitionCanonical: chargeItemDefinition.url ? [chargeItemDefinition.url] : [],
        };

        const createdChargeItem = await medplum.createResource(newChargeItem);
        const appliedChargeItem = await applyChargeItemDefinition(medplum, createdChargeItem);

        updateChargeItems([...chargeItemsState, appliedChargeItem]);
        close();
      } catch (err) {
        showErrorNotification(err);
      }
    },
    [patient, encounter, chargeItemsState, updateChargeItems, medplum, close]
  );

  return (
    <Stack gap={0}>
      <Flex justify="space-between" align="center" mb="md">
        <Text fw={600} size="lg">
          Charge Items
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={addChargeItem}>
          Add Charge Item
        </Button>
      </Flex>

      {chargeItems.length > 0 ? (
        <Stack gap="md">
          {chargeItems.map((chargeItem: ChargeItem) => (
            <ChargeItemPanel
              key={chargeItem.id}
              chargeItem={chargeItem}
              onChange={updateChargeItemList}
              onDelete={deleteChargeItem}
            />
          ))}

          <Card withBorder shadow="sm">
            <Flex justify="space-between" align="center">
              <Text size="lg" fw={500}>
                Total Calculated Price to Bill
              </Text>
              <Box>
                <TextInput w={300} value={`$${calculateTotalPrice(chargeItems)}`} readOnly />
              </Box>
            </Flex>
          </Card>
        </Stack>
      ) : (
        <Card withBorder shadow="sm">
          <Stack gap="md" align="center">
            <Text c="dimmed">No charge items available</Text>
          </Stack>
        </Card>
      )}

      <AddChargeItemModal opened={opened} onClose={close} onSubmit={handleAddChargeItem} />
    </Stack>
  );
};

interface AddChargeItemModalProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (cptCode: CodeableConcept | undefined, chargeItemDefinition: ChargeItemDefinition | undefined) => void;
}

function AddChargeItemModal({ opened, onClose, onSubmit }: AddChargeItemModalProps): JSX.Element {
  const medplum = useMedplum();
  const [cptCode, setCptCode] = useState<CodeableConcept | undefined>();
  const [chargeItemDefinition, setChargeItemDefinition] = useState<ChargeItemDefinition | undefined>();

  const loadChargeItemDefinitions = useCallback(
    async (input: string, signal: AbortSignal): Promise<ChargeItemDefinition[]> => {
      const searchParams = new URLSearchParams({
        title: input,
        _count: '10',
        status: 'active',
      });

      try {
        const resources = await medplum.searchResources('ChargeItemDefinition', searchParams, { signal });
        return resources;
      } catch (error) {
        if (!signal.aborted) {
          console.error('Error searching ChargeItemDefinition:', error);
        }
        return [];
      }
    },
    [medplum]
  );

  const handleSelectChargeItemDefinition = useCallback((items: unknown[]) => {
    if (items.length > 0) {
      setChargeItemDefinition(items[0] as ChargeItemDefinition);
    }
  }, []);

  const handleSubmit = useCallback(() => {
    onSubmit(cptCode, chargeItemDefinition);
    // Clear all state
    setCptCode(undefined);
    setChargeItemDefinition(undefined);
  }, [cptCode, chargeItemDefinition, onSubmit]);

  const handleClose = useCallback(() => {
    // Clear all state
    setCptCode(undefined);
    setChargeItemDefinition(undefined);
    onClose();
  }, [onClose]);

  return (
    <Modal opened={opened} onClose={handleClose} title="Add Charge Item" size="md">
      <Stack gap="md">
        <CodeableConceptInput
          binding="http://www.ama-assn.org/go/cpt/vs"
          label="CPT Code"
          name="cptCode"
          path="ChargeItem.code"
          placeholder="Search for CPT code..."
          required
          onChange={setCptCode}
        />

        <Box>
          <Text size="sm" fw={500} mb={5}>
            Charge Item Definition{' '}
            <Text span c="red">
              *
            </Text>
          </Text>
          <AsyncAutocomplete
            placeholder="Search for charge item definition..."
            onChange={handleSelectChargeItemDefinition}
            toOption={(item: unknown) => {
              const resource = item as ChargeItemDefinition;
              return {
                value: resource.id || '',
                label: resource.title || resource.id || 'Untitled',
                resource: resource,
              };
            }}
            maxValues={1}
            loadOptions={loadChargeItemDefinitions}
          />
        </Box>

        <Flex justify="flex-end" gap="sm" mt="md">
          <Button variant="subtle" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!cptCode || !chargeItemDefinition}>
            Add Charge Item
          </Button>
        </Flex>
      </Stack>
    </Modal>
  );
}
