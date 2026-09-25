// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Checkbox, Group, Pill, Text } from '@mantine/core';
import type { SchedulingRequirement } from '@medplum/core';
import { REQUIRES_DIAGNOSIS_CODE, REQUIRES_MEDICAL_NECESSITY_CODE, REQUIRES_PROCEDURE_CODE } from '@medplum/core';
import type { Coding, ValueSetExpansionContains } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { ValueSetAutocomplete } from '@medplum/react';
import { IconCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import classes from './AppointmentFinder.module.css';
import type { BookingRequirementValues } from './AppointmentFinder.requirements';
import { toCodings } from './AppointmentFinder.requirements';

export interface BookingRequirementFieldsProps {
  /** From the visit type's eligibility codes. A field is shown only for a requirement listed here. */
  readonly requirements: ReadonlySet<SchedulingRequirement>;
  /** The code fields read this once, at mount; the checkbox follows it. */
  readonly values: BookingRequirementValues;
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
  const { requirements, values, procedureBinding, diagnosisBinding, onChange } = props;
  return (
    <>
      {requirements.has(REQUIRES_PROCEDURE_CODE) && (
        <ValueSetAutocomplete
          name="procedure-code"
          label="Procedure codes"
          required
          itemComponent={RequirementCodeItem}
          pillComponent={RequirementCodePill}
          binding={procedureBinding}
          defaultValue={values.procedure.map(toExpansionContains)}
          onChange={(elements) => onChange({ ...values, procedure: toCodings(elements) })}
        />
      )}
      {requirements.has(REQUIRES_DIAGNOSIS_CODE) && (
        <ValueSetAutocomplete
          name="diagnosis-code"
          label="Diagnosis codes"
          required
          itemComponent={RequirementCodeItem}
          pillComponent={RequirementCodePill}
          binding={diagnosisBinding}
          defaultValue={values.diagnosis.map(toExpansionContains)}
          onChange={(elements) => onChange({ ...values, diagnosis: toCodings(elements) })}
        />
      )}
      {requirements.has(REQUIRES_MEDICAL_NECESSITY_CODE) && (
        <Checkbox
          classNames={{ label: classes.requiredLabel }}
          label="Medical necessity confirmed"
          required
          checked={values.medicalNecessity}
          onChange={(event) => onChange({ ...values, medicalNecessity: event.currentTarget.checked })}
        />
      )}
    </>
  );
}

function toExpansionContains(coding: Coding): ValueSetExpansionContains {
  return { system: coding.system, code: coding.code, display: coding.display };
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
