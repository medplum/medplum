import { ActionIcon, Box, Card, Flex, Grid, Menu, Stack, Text, TextInput } from '@mantine/core';
import { HTTP_HL7_ORG } from '@medplum/core';
import { ChargeItem, CodeableConcept } from '@medplum/fhirtypes';
import { CodeableConceptInput } from '@medplum/react';
import { IconTrash } from '@tabler/icons-react';
import { JSX } from 'react';

const CHARGE_ITEM_MODIFIER_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/chargeitem-modifier`;

interface ChargeItemPanelProps {
  chargeItem: ChargeItem;
  onChange: (chargeItem: ChargeItem) => void;
  onDelete: (chargeItem: ChargeItem) => void;
}

export default function ChargeItemPanel(props: ChargeItemPanelProps): JSX.Element {
  const { chargeItem, onChange, onDelete } = props;
  const cptCodes =
    chargeItem?.code?.coding?.filter((coding) => coding.system === 'http://www.ama-assn.org/go/cpt') ?? [];

  const updateCptCodes = (value: CodeableConcept | undefined): void => {
    const updatedChargeItem = { ...chargeItem };
    const existingNonCptCodes =
      chargeItem.code?.coding?.filter((coding) => coding.system !== 'http://www.ama-assn.org/go/cpt') ?? [];
    updatedChargeItem.code = {
      ...(value ?? {}),
      coding: [...(value?.coding ?? []), ...existingNonCptCodes],
    };
    onChange(updatedChargeItem);
  };

  const updateModifierExtension = (value: CodeableConcept | undefined): void => {
    if (!value) {
      const updatedChargeItem = { ...chargeItem };
      updatedChargeItem.extension = undefined;
      onChange(updatedChargeItem);
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
    onChange(updatedChargeItem);
  };

  const getModifierExtension = (item: ChargeItem): CodeableConcept | undefined => {
    if (item?.extension) {
      const modifierExtension = item.extension.find((ext) => ext.url === CHARGE_ITEM_MODIFIER_URL);
      return modifierExtension?.valueCodeableConcept;
    }
    return undefined;
  };

  const modifierExtensionValue = getModifierExtension(chargeItem);

  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack gap="xs" p="md">
        <Flex justify="space-between">
          <Box flex={1} mr="md">
            <CodeableConceptInput
              binding="http://medplum.com/fhir/ValueSet/cpt-codes"
              label="CPT Code"
              name="cptCode"
              path="cptCode"
              defaultValue={cptCodes.length > 0 ? { coding: cptCodes } : undefined}
              onChange={updateCptCodes}
            />
          </Box>

          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle">
                <IconTrash size={24} />
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => onDelete(chargeItem)}>
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Flex>

        <CodeableConceptInput
          binding="http://hl7.org/fhir/ValueSet/claim-modifiers"
          label="Modifiers"
          name="modifiers"
          path="modifiers"
          defaultValue={modifierExtensionValue}
          onChange={updateModifierExtension}
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
            <TextInput
              value={chargeItem.priceOverride?.value ? `$${chargeItem.priceOverride.value.toFixed(2)}` : 'N/A'}
              readOnly
            />
          </Grid.Col>
        </Grid>
      </Stack>
    </Card>
  );
}
