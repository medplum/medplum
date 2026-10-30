// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor, Button, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import type { ChargeItemDefinition, CodeableConcept, Money } from '@medplum/fhirtypes';
import { CodeableConceptInput, Loading, Modal, useMedplum, useResource } from '@medplum/react';
import { IconInfoCircle } from '@tabler/icons-react';
import type { FormEvent, JSX } from 'react';
import { useState } from 'react';
import { CPT_COPYRIGHT_NOTICE } from '../../config/constants';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';

/** Links the Save button in the modal footer to the form in the modal body. */
const FORM_ID = 'charge-item-definition-form';

const NEW_CHARGE_ITEM_DEFINITION: ChargeItemDefinition = {
  resourceType: 'ChargeItemDefinition',
  url: '',
  status: 'active',
};

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'retired', label: 'Retired' },
];

/**
 * Props for the charge item modal. `chargeItemId` is the ChargeItemDefinition to edit, or undefined to create
 * one; the modal is open while `opened`.
 */
export interface ChargeItemDefinitionModalProps {
  readonly chargeItemId: string | undefined;
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

/**
 * Modal for creating or editing a ChargeItemDefinition. The form inside mounts fresh on every open and remounts
 * when the definition changes, so its state is always seeded from the one being edited.
 * @param props - The ChargeItemDefinitionModal React props.
 * @returns The ChargeItemDefinitionModal React node.
 */
export function ChargeItemDefinitionModal(props: ChargeItemDefinitionModalProps): JSX.Element {
  const { chargeItemId, opened, onClose, onSaved } = props;
  const existing = useResource<ChargeItemDefinition>(
    chargeItemId ? { reference: `ChargeItemDefinition/${chargeItemId}` } : undefined
  );
  const definition = chargeItemId ? existing : NEW_CHARGE_ITEM_DEFINITION;
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={chargeItemId ? 'Edit charge item' : 'New charge item'}
      actions={
        <Button type="submit" form={FORM_ID} loading={saving} disabled={!definition}>
          Save
        </Button>
      }
    >
      {opened &&
        (definition ? (
          <ChargeItemDefinitionForm
            key={definition.id ?? 'new'}
            definition={definition}
            onSavingChange={setSaving}
            onSaved={() => {
              onSaved();
              onClose();
            }}
          />
        ) : (
          <Loading />
        ))}
    </Modal>
  );
}

interface ChargeItemDefinitionFormProps {
  readonly definition: ChargeItemDefinition;
  readonly onSavingChange: (saving: boolean) => void;
  readonly onSaved: () => void;
}

/**
 * The charge item fields: a title, one CPT code, one base price and a status. Saving writes them onto the
 * definition and keeps everything else it has. A definition with several codes or price groups does not fit those
 * fields, so only its title and status are edited here and the rest is left to the full resource editor.
 * @param props - The ChargeItemDefinitionForm React props.
 * @returns The ChargeItemDefinitionForm React node.
 */
function ChargeItemDefinitionForm(props: ChargeItemDefinitionFormProps): JSX.Element {
  const { definition, onSavingChange, onSaved } = props;
  const medplum = useMedplum();
  const simple = isSimpleChargeItemDefinition(definition);
  const [title, setTitle] = useState(definition.title ?? '');
  const [code, setCode] = useState<CodeableConcept | undefined>(definition.code);
  const [price, setPrice] = useState<number | undefined>(getBasePrice(definition)?.value);
  const [status, setStatus] = useState<ChargeItemDefinition['status']>(definition.status);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    onSavingChange(true);
    try {
      const built = buildChargeItemDefinition(definition, { title, code, price, status }, simple);
      if (built.id) {
        await medplum.updateResource(built);
      } else {
        await medplum.createResource(built);
      }
      showSuccessNotification({ title: 'Success', message: `Charge item ${built.id ? 'updated' : 'created'}` });
      onSaved();
    } catch (err) {
      showErrorNotification(err);
    } finally {
      onSavingChange(false);
    }
  };

  return (
    <form id={FORM_ID} onSubmit={(event) => handleSubmit(event).catch(console.error)}>
      <Stack gap="md">
        {!simple && (
          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
            This charge item has several codes or price groups, so only its title and status can be edited here.{' '}
            <Anchor href={`/ChargeItemDefinition/${definition.id}/edit`} inherit>
              Open the full editor
            </Anchor>{' '}
            to change the rest.
          </Alert>
        )}
        <TextInput label="Title" required value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
        {simple && (
          <>
            <div>
              <CodeableConceptInput
                binding="http://www.ama-assn.org/go/cpt/vs"
                label="CPT Code"
                name="code"
                path="ChargeItemDefinition.code"
                placeholder="Search for CPT code..."
                maxValues={1}
                defaultValue={code}
                onChange={setCode}
              />
              <Text size="xs" c="dimmed" mt={4}>
                {CPT_COPYRIGHT_NOTICE}
              </Text>
            </div>
            <NumberInput
              label="Price"
              prefix="$"
              decimalScale={2}
              fixedDecimalScale
              min={0}
              thousandSeparator=","
              value={price ?? ''}
              onChange={(value) => setPrice(parsePrice(value))}
            />
          </>
        )}
        <Select
          label="Status"
          required
          allowDeselect={false}
          data={STATUS_OPTIONS}
          value={status}
          onChange={(value) => value && setStatus(value as ChargeItemDefinition['status'])}
        />
      </Stack>
    </form>
  );
}

/**
 * Whether a definition fits the simple form: at most one code, one price group and one price component.
 * @param definition - The ChargeItemDefinition.
 * @returns True when the form can edit its code and price without losing anything.
 */
function isSimpleChargeItemDefinition(definition: ChargeItemDefinition): boolean {
  const groups = definition.propertyGroup ?? [];
  return (
    (definition.code?.coding?.length ?? 0) <= 1 && groups.length <= 1 && (groups[0]?.priceComponent?.length ?? 0) <= 1
  );
}

/**
 * Reads the price input, which reports a number once it parses and a string while empty or mid-edit.
 * @param value - The NumberInput value.
 * @returns The price, or undefined when the field is empty.
 */
function parsePrice(value: number | string): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Number.parseFloat(value.replaceAll(/[$,]/g, ''));
  return Number.isNaN(parsed) ? undefined : parsed;
}

function getBasePrice(definition: ChargeItemDefinition): Money | undefined {
  return definition.propertyGroup?.[0]?.priceComponent?.[0]?.amount;
}

interface ChargeItemDefinitionFields {
  readonly title: string;
  readonly code: CodeableConcept | undefined;
  readonly price: number | undefined;
  readonly status: ChargeItemDefinition['status'];
}

/**
 * Writes the form fields onto the definition, keeping its other fields. A new definition gets a `urn:uuid` URL,
 * since FHIR requires one and there is no canonical URL to give it.
 * @param definition - The definition being edited.
 * @param fields - The form fields.
 * @param simple - Whether the form edited the code and price.
 * @returns The definition to save.
 */
function buildChargeItemDefinition(
  definition: ChargeItemDefinition,
  fields: ChargeItemDefinitionFields,
  simple: boolean
): ChargeItemDefinition {
  const built: ChargeItemDefinition = {
    ...definition,
    url: definition.url || `urn:uuid:${crypto.randomUUID()}`,
    title: fields.title.trim(),
    status: fields.status,
  };
  if (!simple) {
    return built;
  }
  built.code = fields.code?.coding?.length ? fields.code : undefined;
  const { priceComponent, ...group } = definition.propertyGroup?.[0] ?? {};
  const component = priceComponent?.[0];
  const priced =
    fields.price === undefined
      ? group
      : {
          ...group,
          priceComponent: [
            {
              ...component,
              type: component?.type ?? 'base',
              amount: { value: fields.price, currency: component?.amount?.currency ?? 'USD' },
            },
          ],
        };
  built.propertyGroup = Object.keys(priced).length > 0 ? [priced] : undefined;
  return built;
}
