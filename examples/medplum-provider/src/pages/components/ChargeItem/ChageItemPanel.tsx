import { TextInput, Text, Stack, ActionIcon, Card, Flex, Grid } from '@mantine/core';
import { IconDotsVertical } from '@tabler/icons-react';
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
          <Grid.Col span={12}>
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
        <Grid columns={12} mt="md">
          <Grid.Col span={7}>
            <Text size="sm" c="dimmed" pt={12}>
              Price calculated from Price chart, taking into account applied modifiers and patient's selected insurance
              plan.
            </Text>
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
