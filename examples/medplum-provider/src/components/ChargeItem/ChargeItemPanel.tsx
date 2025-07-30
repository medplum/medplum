import { ActionIcon, Box, Card, Flex, Grid, Menu, Stack, Text, TextInput } from '@mantine/core';
import { HTTP_HL7_ORG } from '@medplum/core';
import { ChargeItem, CodeableConcept, Money } from '@medplum/fhirtypes';
import { CodeableConceptInput, useMedplum } from '@medplum/react';
import { IconTrash } from '@tabler/icons-react';
import { JSX, useEffect, useState } from 'react';
import { applyChargeItemDefinition } from '../../utils/chargeitems';

const CHARGE_ITEM_MODIFIER_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/chargeitem-modifier`;
const CPT_CODE_SYSTEM = 'http://www.ama-assn.org/go/cpt';

interface ChargeItemPanelProps {
  chargeItem: ChargeItem;
  onChange: (chargeItem: ChargeItem) => void;
  onDelete: (chargeItem: ChargeItem) => void;
}

export default function ChargeItemPanel(props: ChargeItemPanelProps): JSX.Element {
  const { chargeItem, onChange, onDelete } = props;
  const medplum = useMedplum();
  const [modifierExtensionValue, setModifierExtensionValue] = useState<CodeableConcept | undefined>();
  const [cptCodes, setCptCodes] = useState<CodeableConcept>();
  const [price, setPrice] = useState<Money | undefined>();

  useEffect(() => {
    setPrice(chargeItem.priceOverride);
    setModifierExtensionValue(getModifierExtension(chargeItem));
    const cptCodes = chargeItem?.code?.coding?.filter((coding) => coding.system === CPT_CODE_SYSTEM) ?? [];
    setCptCodes({ coding: cptCodes });
  }, [chargeItem]);

  const updateCptCodes = (value: CodeableConcept | undefined): void => {
    const updatedChargeItem = { ...chargeItem };
    const existingNonCptCodes = chargeItem.code?.coding?.filter((coding) => coding.system !== CPT_CODE_SYSTEM) ?? [];
    updatedChargeItem.code = {
      ...(value ?? {}),
      coding: [...(value?.coding ?? []), ...existingNonCptCodes],
    };
    onChange(updatedChargeItem);
  };

  const updateModifiers = async (value: CodeableConcept | undefined): Promise<void> => {
    if (!value) {
      const updatedChargeItem = { ...chargeItem };
      updatedChargeItem.extension = undefined;
      await updateChargeItem(updatedChargeItem);
      return;
    }
    const updatedChargeItem = { ...chargeItem };
    updatedChargeItem.extension = updatedChargeItem.extension ? [...updatedChargeItem.extension] : [];
    const modifierExtension = {
      url: CHARGE_ITEM_MODIFIER_URL,
      valueCodeableConcept: value,
    };
    const existingIndex = updatedChargeItem.extension.findIndex((ext) => ext.url === CHARGE_ITEM_MODIFIER_URL);
    if (existingIndex >= 0) {
      updatedChargeItem.extension[existingIndex] = modifierExtension;
    } else {
      updatedChargeItem.extension.push(modifierExtension);
    }
    await updateChargeItem(updatedChargeItem);
  };

  const updateChargeItem = async (updatedChargeItem: ChargeItem): Promise<void> => {
    await medplum.updateResource(updatedChargeItem);
    const appliedChargeItem = await applyChargeItemDefinition(medplum, updatedChargeItem);
    onChange(appliedChargeItem);
  };

  const deleteChargeItem = async (): Promise<void> => {
    await medplum.deleteResource('ChargeItem', chargeItem.id as string);
    onDelete(chargeItem);
  };

  const getModifierExtension = (item: ChargeItem): CodeableConcept | undefined => {
    if (item?.extension) {
      const modifierExtension = item.extension.find((ext) => ext.url === CHARGE_ITEM_MODIFIER_URL);
      return modifierExtension?.valueCodeableConcept;
    }
    return undefined;
  };

  const cptCodeKey = `cpt-${chargeItem.id}-${JSON.stringify(cptCodes?.coding)}`;
  const modifierKey = `modifier-${chargeItem.id}-${JSON.stringify(modifierExtensionValue)}`;

  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack gap="xs" p="md">
        <Flex justify="space-between">
          <Box flex={1} mr="md">
            <CodeableConceptInput
              key={cptCodeKey}
              binding="http://www.ama-assn.org/go/cpt/vs"
              label="CPT Code"
              name="cptCode"
              path="cptCode"
              defaultValue={cptCodes}
              onChange={updateCptCodes}
              readOnly
              disabled={true}
            />
          </Box>

          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle">
                <IconTrash size={24} />
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={deleteChargeItem}>
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Flex>

        <CodeableConceptInput
          key={modifierKey}
          binding="http://hl7.org/fhir/ValueSet/claim-modifiers"
          label="Modifiers"
          name="modifiers"
          path="modifiers"
          defaultValue={modifierExtensionValue}
          onChange={updateModifiers}
        />

        <Grid columns={12} mt="md">
          <Grid.Col span={7}>
            <Flex h="100%" direction="column" justify="flex-end" pt={4}>
              <Text size="sm" c="dimmed">
                Price calculated from Price chart, taking into account applied modifiers and patient's selected
                insurance plan.
              </Text>
            </Flex>
          </Grid.Col>
          <Grid.Col span={5}>
            <Text size="sm" fw={500} mb={8}>
              Calculated Price
            </Text>
            <TextInput value={price?.value ? `$${price.value.toFixed(2)}` : 'N/A'} readOnly />
          </Grid.Col>
        </Grid>
      </Stack>
    </Card>
  );
}
