import { Button, Group, Stack, TextInput } from '@mantine/core';
import { HTTP_HL7_ORG, addProfileToResource, createReference } from '@medplum/core';
import { AllergyIntolerance, CodeableConcept, Encounter, Patient } from '@medplum/fhirtypes';
import { useCallback, useState } from 'react';
import { CodeableConceptInput } from '../CodeableConceptInput/CodeableConceptInput';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { Form } from '../Form/Form';

export interface AllergyDialogProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly allergy?: AllergyIntolerance;
  readonly onSubmit: (allergy: AllergyIntolerance) => void;
}

const HTTP = 'http://';

const PATIENT_ALLERGY_PROFILE = HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-allergyintolerance';

export function AllergyDialog(props: AllergyDialogProps): JSX.Element {
  const { patient, encounter, allergy, onSubmit } = props;
  const [code, setCode] = useState<CodeableConcept | undefined>(allergy?.code);
  const [clinicalStatus, setClinicalStatus] = useState<CodeableConcept | undefined>(allergy?.clinicalStatus);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      onSubmit(
        addProfileToResource(
          {
            ...allergy,
            resourceType: 'AllergyIntolerance',
            patient: createReference(patient),
            encounter: encounter ? createReference(encounter) : undefined,
            code,
            clinicalStatus,
            onsetDateTime: formData.onsetDateTime ? formData.onsetDateTime : undefined,
            reaction: formData.reaction ? [{ manifestation: [{ text: formData.reaction }] }] : undefined,
          },
          PATIENT_ALLERGY_PROFILE
        )
      );
    },
    [patient, encounter, allergy, code, clinicalStatus, onSubmit]
  );

  return (
    <Form key={allergy?.id} onSubmit={handleSubmit}>
      <Stack>
        <CodeableConceptInput
          name="allergy"
          label="Code"
          path="AllergyIntolerance.code"
          data-autofocus={true}
          binding={HTTP + 'cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1186.8'}
          maxValues={1}
          defaultValue={allergy?.code}
          onChange={(code) => setCode(code)}
          outcome={undefined}
        />
        <TextInput name="reaction" label="Reaction" defaultValue={allergy?.reaction?.[0]?.manifestation?.[0]?.text} />
        <CodeableConceptInput
          name="clinicalStatus"
          label="Clinical Status"
          path="AllergyIntolerance.clinicalStatus"
          binding={HTTP_HL7_ORG + '/fhir/ValueSet/allergyintolerance-clinical'}
          maxValues={1}
          defaultValue={allergy?.clinicalStatus}
          onChange={(clinicalStatus) => setClinicalStatus(clinicalStatus)}
          outcome={undefined}
        />
        <DateTimeInput name="onsetDateTime" label="Onset" defaultValue={allergy?.recordedDate} />
        <Group justify="flex-end" gap={4} mt="md">
          <Button type="submit">Save</Button>
        </Group>
      </Stack>
    </Form>
  );
}
