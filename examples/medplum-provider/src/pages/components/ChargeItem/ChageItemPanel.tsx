import { TextInput, NumberInput, Text, Stack, ActionIcon, Card, Flex, Grid } from '@mantine/core';
import { IconDotsVertical, IconChevronDown } from '@tabler/icons-react';
import { ChargeItem, CodeableConcept } from '@medplum/fhirtypes';
import { CodeableConceptInput } from '@medplum/react';
import { HTTP_HL7_ORG } from '@medplum/core';

const CHARGE_ITEM_MODIFIER_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/chargeitem-modifier`;

interface ChargeItemPanelProps {
  chargeItem: ChargeItem;
  onChange: (chargeItem: ChargeItem) => void;
}

export default function ChargeItemPanel(props: ChargeItemPanelProps): JSX.Element {
  const { chargeItem, onChange } = props;

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

  const handleQuantityChange = (value: number): void => {
    const updatedChargeItem = { ...chargeItem };
    updatedChargeItem.quantity = { value: value };
    onChange(updatedChargeItem);
  };

  const modifierExtensionValue = getModifierExtension(chargeItem);

  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack gap="xs" p="md">
        <Flex justify="flex-end" align="center" mb="md">
          <ActionIcon variant="subtle">
            <IconDotsVertical size={18} />
          </ActionIcon>
        </Flex>
        <Grid columns={12}>
          <Grid.Col span={10}>
            <Text size="sm" fw={500} mb={8}>
              Procedure, Service, or Other CPT Code
            </Text>
            {chargeItem?.code?.coding?.map((coding) => {
              if (coding.system === 'http://www.ama-assn.org/go/cpt') {
                return <TextInput key={coding.code} defaultValue={`${coding.code}: ${coding.display}`} readOnly />;
              }
              return null;
            })}
          </Grid.Col>
          <Grid.Col span={2}>
            <Text size="sm" fw={500} mb={8}>
              Quantity
            </Text>
            <NumberInput
              defaultValue={chargeItem.quantity?.value}
              onChange={(value) => handleQuantityChange(value as number)}
              min={1}
              max={99}
              step={1}
              rightSection={<IconChevronDown size={14} />}
              rightSectionProps={{ style: { pointerEvents: 'none' } }}
            />
          </Grid.Col>
        </Grid>
        <CodeableConceptInput
          binding="http://hl7.org/fhir/ValueSet/claim-modifiers"
          label="Modifiers"
          name="modifiers"
          path="modifiers"
          defaultValue={modifierExtensionValue}
          onChange={(value) => {
            updateModifierExtension(value);
          }}
        />
      </Stack>
    </Card>
  );
}
