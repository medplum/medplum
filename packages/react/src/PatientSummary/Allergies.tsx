import { Anchor, Badge, Box, Button, Group, Modal, NativeSelect, Stack, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { createReference } from '@medplum/core';
import { AllergyIntolerance, CodeableConcept, Encounter, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useState } from 'react';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import { CodeableConceptInput } from '../CodeableConceptInput/CodeableConceptInput';
import { Form } from '../Form/Form';
import { killEvent } from '../utils/dom';

export interface AllergiesProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly allergies: AllergyIntolerance[];
}

export function Allergies(props: AllergiesProps): JSX.Element {
  const medplum = useMedplum();
  const { patient, encounter } = props;
  const [allergies, setAllergies] = useState<AllergyIntolerance[]>(props.allergies);
  const [opened, { open, close }] = useDisclosure(false);
  const [code, setCode] = useState<CodeableConcept>();

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      medplum
        .createResource<AllergyIntolerance>({
          resourceType: 'AllergyIntolerance',
          patient: createReference(patient),
          encounter: encounter ? createReference(encounter) : undefined,
          code,
          onsetDateTime: formData.onset ? formData.onset : undefined,
          reaction: formData.reaction ? [{ manifestation: [{ text: formData.reaction }] }] : undefined,
        })
        .then((newAllergy) => {
          setAllergies([...allergies, newAllergy]);
          close();
        })
        .catch(console.error);
    },
    [medplum, patient, encounter, allergies, close, code]
  );

  return (
    <>
      <Group justify="space-between">
        <Text fz="md" fw={700}>
          Allergies
        </Text>
        <Anchor
          href="#"
          onClick={(e) => {
            killEvent(e);
            open();
          }}
        >
          + Add
        </Anchor>
      </Group>
      {allergies.length > 0 ? (
        <Box>
          {allergies.map((allergy) => (
            <Badge key={allergy.id} variant="light" maw="100%">
              <CodeableConceptDisplay value={allergy.code} />
            </Badge>
          ))}
        </Box>
      ) : (
        <Text>(none)</Text>
      )}
      <Modal opened={opened} onClose={close} title="Add Allergy">
        <Form onSubmit={handleSubmit}>
          <Stack>
            <CodeableConceptInput
              name="allergy"
              path="AllergyIntolerance.code"
              data-autofocus={true}
              binding="http://hl7.org/fhir/us/core/ValueSet/us-core-allergy-substance"
              onChange={(allergy) => setCode(allergy)}
              outcome={undefined}
            />
            <TextInput name="reaction" label="Reaction" />
            <NativeSelect name="status" label="Status" data={['active']} />
            <TextInput name="onset" label="Onset" type="date" />
            <Group justify="flex-end" gap={4} mt="md">
              <Button type="submit">Save</Button>
            </Group>
          </Stack>
        </Form>
      </Modal>
    </>
  );
}
