// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Button, Card, Group, MultiSelect, NumberInput, Select, Stack, Text } from '@mantine/core';
import { formatMoney } from '@medplum/core';
import type { Claim, ClaimItem } from '@medplum/fhirtypes';
import { CodingInput, codingToValueSetElement, ValueSetAutocomplete, valueSetElementToCoding } from '@medplum/react';
import { IconCirclePlus, IconTrash, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { PROCEDURE_MODIFIERS_VALUE_SET } from '../../config/constants';
import {
  addDiagnosis,
  addLine,
  getLineCharge,
  MAX_CLAIM_DIAGNOSES,
  MAX_DIAGNOSIS_POINTERS,
  moveDiagnosis,
  removeDiagnosis,
  removeLine,
  updateLine,
} from './claimEditing';
import classes from './ClaimEditor.module.css';

const ICD10_BINDING = 'http://hl7.org/fhir/sid/icd-10-cm/vs/billable';
const CPT_BINDING = 'http://www.ama-assn.org/go/cpt/vs';

export interface ClaimEditorProps {
  readonly claim: Claim;
  readonly onChange: (claim: Claim) => void;
}

function toDiagnosisLetter(sequence: number): string {
  return String.fromCharCode(64 + sequence);
}

/**
 * Edits a claim's diagnoses: reorder them (the first is principal), remove them, or add ICD-10 codes.
 * @param props - The ClaimEditor React props.
 * @returns The diagnoses editor.
 */
export function ClaimDiagnosesEditor(props: ClaimEditorProps): JSX.Element {
  const { claim, onChange } = props;
  const diagnoses = claim.diagnosis ?? [];
  const [adding, setAdding] = useState(diagnoses.length === 0);
  const positions = diagnoses.map((d) => String(d.sequence));

  return (
    <Stack gap="sm">
      {diagnoses.map((d) => {
        const coding = d.diagnosisCodeableConcept?.coding?.[0];
        return (
          <Group key={`${d.sequence}-${coding?.code}`} gap="sm" wrap="nowrap">
            <Select
              size="xs"
              w={64}
              aria-label={`Order of ${coding?.code ?? 'diagnosis'}`}
              data={positions}
              value={String(d.sequence)}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
              onChange={(value) => value && onChange(moveDiagnosis(claim, d.sequence, Number(value)))}
            />
            <Text size="sm" fw={600} w={16}>
              {toDiagnosisLetter(d.sequence)}
            </Text>
            <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
              {coding?.code} {coding?.display ?? d.diagnosisCodeableConcept?.text}
            </Text>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={`Remove ${coding?.code ?? 'diagnosis'}`}
              onClick={() => onChange(removeDiagnosis(claim, d.sequence))}
            >
              <IconX size={16} />
            </ActionIcon>
          </Group>
        );
      })}
      {adding ? (
        <CodingInput
          key={diagnoses.length}
          name="new-diagnosis"
          path="diagnosis"
          binding={ICD10_BINDING}
          placeholder="Search ICD-10 codes"
          withHelpText={false}
          onChange={(coding) => {
            if (coding) {
              onChange(addDiagnosis(claim, coding));
              setAdding(false);
            }
          }}
        />
      ) : (
        diagnoses.length < MAX_CLAIM_DIAGNOSES && (
          <Button
            variant="default"
            fullWidth
            className={classes.addButton}
            leftSection={<IconCirclePlus size={16} />}
            onClick={() => setAdding(true)}
          >
            Add a Diagnosis
          </Button>
        )
      )}
    </Stack>
  );
}

/**
 * Edits a claim's service lines: the CPT code, modifiers, diagnosis pointers and charge of each, and adds or removes
 * lines. Shows the billed total under them.
 * @param props - The ClaimEditor React props.
 * @returns The service lines editor.
 */
export function ClaimLinesEditor(props: ClaimEditorProps): JSX.Element {
  const { claim, onChange } = props;
  const lines = claim.item ?? [];
  const pointerOptions = (claim.diagnosis ?? []).map((d) => {
    const code = d.diagnosisCodeableConcept?.coding?.[0]?.code;
    return { value: String(d.sequence), label: `${toDiagnosisLetter(d.sequence)}${code ? ` · ${code}` : ''}` };
  });
  const total = lines.reduce((sum, item) => sum + getLineCharge(item), 0);
  const change = (item: ClaimItem, changes: Partial<ClaimItem>): void =>
    onChange(updateLine(claim, item.sequence, changes));

  return (
    <Stack gap="sm">
      {lines.map((item) => {
        const coding = item.productOrService?.coding?.[0];
        return (
          <Card key={`${item.sequence}-${coding?.code ?? 'new'}`} withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group gap="sm" wrap="nowrap" align="flex-end">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CodingInput
                    name={`line-${item.sequence}-code`}
                    path="item.productOrService"
                    label="CPT Code"
                    binding={CPT_BINDING}
                    placeholder="Search CPT codes"
                    withHelpText={false}
                    defaultValue={coding}
                    onChange={(next) =>
                      change(item, { productOrService: next ? { coding: [next], text: next.display } : {} })
                    }
                  />
                </div>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size={36}
                  aria-label={`Remove line ${item.sequence}`}
                  onClick={() => onChange(removeLine(claim, item.sequence))}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
              <div className={classes.lineFields}>
                <ValueSetAutocomplete
                  name={`line-${item.sequence}-modifiers`}
                  label="Modifiers"
                  binding={PROCEDURE_MODIFIERS_VALUE_SET}
                  placeholder="Select a modifier…"
                  maxValues={4}
                  withHelpText={false}
                  defaultValue={(item.modifier ?? [])
                    .map((m) => m.coding?.[0])
                    .filter((c) => c !== undefined)
                    .map(codingToValueSetElement)}
                  onChange={(values) =>
                    change(item, {
                      modifier: values.length
                        ? values.map((v) => ({ coding: [valueSetElementToCoding(v)] }))
                        : undefined,
                    })
                  }
                />
                <MultiSelect
                  label="Diagnosis Pointer"
                  placeholder={item.diagnosisSequence?.length ? undefined : 'Select a dx pointer…'}
                  data={pointerOptions}
                  value={(item.diagnosisSequence ?? []).map(String)}
                  maxValues={MAX_DIAGNOSIS_POINTERS}
                  error={!item.diagnosisSequence?.length && pointerOptions.length > 0 ? 'Required' : undefined}
                  comboboxProps={{ withinPortal: true }}
                  onChange={(values) =>
                    change(item, {
                      diagnosisSequence: values.length ? values.map(Number).sort((a, b) => a - b) : undefined,
                    })
                  }
                />
                <NumberInput
                  label="Charge"
                  prefix="$"
                  decimalScale={2}
                  fixedDecimalScale
                  min={0}
                  thousandSeparator=","
                  value={getLineCharge(item) || ''}
                  onChange={(value) => {
                    const amount = typeof value === 'number' ? value : Number.parseFloat(value.replaceAll(',', ''));
                    change(item, {
                      net: Number.isFinite(amount) ? { value: amount, currency: 'USD' } : undefined,
                      unitPrice: undefined,
                    });
                  }}
                />
              </div>
            </Stack>
          </Card>
        );
      })}
      <Button
        variant="default"
        fullWidth
        className={classes.addButton}
        leftSection={<IconCirclePlus size={16} />}
        onClick={() => onChange(addLine(claim))}
      >
        Add a Service Line
      </Button>
      <Group justify="space-between" className={classes.total}>
        <Text size="sm" fw={500}>
          Total Billed
        </Text>
        <Text size="lg" fw={700}>
          {formatMoney({ value: total, currency: 'USD' })}
        </Text>
      </Group>
    </Stack>
  );
}
