// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Button, Checkbox, Group, Input, Pill, Stack, Text } from '@mantine/core';
import type { SchedulingRequirement } from '@medplum/core';
import { REQUIRES_DIAGNOSIS_CODE, REQUIRES_MEDICAL_NECESSITY_CODE, REQUIRES_PROCEDURE_CODE } from '@medplum/core';
import type { CodeableConcept, ValueSetExpansionContains } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { CodeableConceptInput } from '@medplum/react';
import { IconCheck, IconPlus, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import classes from './AppointmentFinder.module.css';
import type { BookingRequirementValues } from './AppointmentFinder.requirements';
import { toCodedConcept } from './AppointmentFinder.requirements';

export interface BookingRequirementFieldsProps {
  /** From the visit type's eligibility codes. A field is shown only for a requirement listed here. */
  readonly requirements: ReadonlySet<SchedulingRequirement>;
  /** The code fields read this once, at mount; the checkbox follows it. */
  readonly values: BookingRequirementValues;
  /** Show an inline error on each unanswered required field. */
  readonly showValidation?: boolean;
  readonly procedureBinding: string;
  readonly diagnosisBinding: string;
  readonly onChange: (values: BookingRequirementValues) => void;
}

/**
 * The fields answering a visit type's requirements: its procedure codes, its diagnosis codes,
 * and the medical necessity attestation.
 *
 * @param props - The React props.
 * @returns The fields the visit type asks for.
 */
export function BookingRequirementFields(props: BookingRequirementFieldsProps): JSX.Element {
  const { requirements, values, procedureBinding, diagnosisBinding, onChange, showValidation } = props;
  return (
    <>
      {requirements.has(REQUIRES_PROCEDURE_CODE) && (
        <ConceptRows
          name="procedure-code"
          path="Appointment.serviceType"
          label="Procedure codes"
          rowLabel="Procedure"
          error={showValidation && values.procedure.length === 0 ? 'Add at least one procedure code.' : undefined}
          binding={procedureBinding}
          defaultValue={values.procedure}
          onChange={(procedure) => onChange({ ...values, procedure })}
        />
      )}
      {requirements.has(REQUIRES_DIAGNOSIS_CODE) && (
        <ConceptRows
          name="diagnosis-code"
          path="Appointment.reasonCode"
          label="Diagnosis codes"
          rowLabel="Diagnosis"
          error={showValidation && values.diagnosis.length === 0 ? 'Add at least one diagnosis code.' : undefined}
          binding={diagnosisBinding}
          defaultValue={values.diagnosis}
          onChange={(diagnosis) => onChange({ ...values, diagnosis })}
        />
      )}
      {requirements.has(REQUIRES_MEDICAL_NECESSITY_CODE) && (
        <Checkbox
          classNames={{ label: classes.requiredLabel }}
          error={showValidation && !values.medicalNecessity ? 'Confirm medical necessity.' : undefined}
          label="Medical necessity confirmed"
          required
          checked={values.medicalNecessity}
          onChange={(event) => onChange({ ...values, medicalNecessity: event.currentTarget.checked })}
        />
      )}
    </>
  );
}

interface ConceptRow {
  readonly id: number;
  readonly concept?: CodeableConcept;
}

let nextConceptRowId = 0;

function createConceptRow(concept?: CodeableConcept): ConceptRow {
  nextConceptRowId++;
  return { id: nextConceptRowId, concept };
}

interface ConceptRowsProps {
  readonly name: string;
  readonly path: string;
  readonly label: string;
  /** What one row holds, e.g. `Procedure`. */
  readonly rowLabel: string;
  readonly error?: string;
  readonly binding: string;
  /** Read once, at mount. */
  readonly defaultValue: readonly CodeableConcept[];
  readonly onChange: (concepts: CodeableConcept[]) => void;
}

/**
 * A list of concepts, one row each, similar to the way `ResourceForm` edits a `CodeableConcept[]`.
 *
 * The pills in a row are that one concept's codings, so a concept recorded with several codes
 * shows and edits all of them. A row left untouched records its concept exactly as it was held.
 *
 * @param props - The React props.
 * @returns The rows, and the controls that add and remove them.
 */
function ConceptRows(props: ConceptRowsProps): JSX.Element {
  const { name, path, label, rowLabel, error, binding, onChange } = props;
  const [rows, setRows] = useState<ConceptRow[]>(() =>
    props.defaultValue.length > 0 ? props.defaultValue.map(createConceptRow) : [createConceptRow()]
  );
  const several = rows.length > 1;
  const lowercaseRowLabel = rowLabel.toLowerCase();

  function change(next: ConceptRow[]): void {
    setRows(next);
    onChange(next.flatMap((row) => (row.concept ? [row.concept] : [])));
  }

  return (
    <Stack gap={4} role="group" aria-label={label}>
      {several && (
        <Input.Label labelElement="div" required>
          {label}
        </Input.Label>
      )}

      {rows.map((row, index) => (
        <Group key={row.id} align="flex-end" wrap="nowrap" gap="xs">
          <Box flex={1} miw={0}>
            <CodeableConceptInput
              name={`${name}.${index}`}
              path={path}
              label={
                several ? (
                  <Text span c="dimmed" fw={400} inherit>
                    {rowLabel} {index + 1}
                  </Text>
                ) : (
                  label
                )
              }
              required
              withAsterisk={!several}
              placeholder={
                row.concept?.coding?.length
                  ? `Another code for this ${lowercaseRowLabel}`
                  : (row.concept?.text ?? `Search ${lowercaseRowLabel} codes`)
              }
              itemComponent={RequirementCodeItem}
              pillComponent={RequirementCodePill}
              binding={binding}
              defaultValue={row.concept}
              onChange={(concept) =>
                change(rows.map((held) => (held.id === row.id ? { ...held, concept: toCodedConcept(concept) } : held)))
              }
            />
          </Box>

          {several && (
            <ActionIcon
              variant="subtle"
              color="gray"
              radius="xl"
              size="lg"
              aria-label={`Remove ${lowercaseRowLabel} ${index + 1}`}
              onClick={() => change(rows.filter((held) => held.id !== row.id))}
            >
              <IconX size={16} stroke={1.8} />
            </ActionIcon>
          )}
        </Group>
      ))}

      {!!rows.at(-1)?.concept && (
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<IconPlus size={14} stroke={1.8} />}
          style={{ alignSelf: 'flex-start' }}
          onClick={() => change([...rows, createConceptRow()])}
        >
          Add another {lowercaseRowLabel}
        </Button>
      )}

      {error && (
        <Text size="xs" c="red" role="alert">
          {error}
        </Text>
      )}
    </Stack>
  );
}

/**
 * One code on offer, led by the code itself.
 *
 * The code is what a scheduler searches on and what a biller reads, and descriptions run long
 * before they diverge: the CPT descriptions for infusion procedures, to take one example, agree
 * for sixty characters. Led by its description, a row does not tell itself apart from the next.
 * The system is left out because a field's value set draws from a single code system in practice,
 * which makes printing it one url repeated down the list and nothing more.
 *
 * @param props - The option to render.
 * @returns The row.
 */
function RequirementCodeItem(props: Readonly<AsyncAutocompleteOption<ValueSetExpansionContains>>): JSX.Element {
  const { label, resource, active } = props;
  return (
    <Group wrap="nowrap" gap="xs">
      {active && <IconCheck size={12} />}
      <Text size="sm">
        <Text span fw={600}>
          {resource.code}
        </Text>{' '}
        <Text span>{label}</Text>
      </Text>
    </Group>
  );
}

interface RequirementCodePillProps {
  readonly item: AsyncAutocompleteOption<ValueSetExpansionContains>;
  readonly disabled?: boolean;
  readonly onRemove: () => void;
}

/**
 * A code that has been given, led by the code.
 *
 * What a scheduler checks a filled-in form against, and what a biller reads off it, is the code, so
 * it comes first and stays readable however narrow the pill gets. The description follows and is
 * clipped, since a dozen words times three pills would bury the rest of the form. The full text is
 * on the pill's `title`. A code typed in rather than picked off the list is its own description, so
 * it is printed once rather than twice.
 *
 * @param props - The chosen option, and how to take it back out.
 * @returns The pill.
 */
function RequirementCodePill(props: RequirementCodePillProps): JSX.Element {
  const { item, disabled, onRemove } = props;
  const code = item.resource.code;
  return (
    <Pill className={classes.codePill} withRemoveButton={!disabled} onRemove={onRemove} title={item.label}>
      {code && code !== item.label ? `${code} · ${item.label}` : item.label}
    </Pill>
  );
}
