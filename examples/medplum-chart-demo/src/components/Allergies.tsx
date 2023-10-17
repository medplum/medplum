import { Anchor, Badge, Box, Button, Group, Modal, NativeSelect, Stack, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { createReference } from '@medplum/core';
import { AllergyIntolerance, CodeableConcept, Encounter, Patient } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, CodeableConceptInput, Form, useMedplum } from '@medplum/react';
import React, { useCallback, useState } from 'react';

export interface AllergiesProps {
  patient: Patient;
  encounter?: Encounter;
  allergies: AllergyIntolerance[];
}

export function Allergies(props: AllergiesProps): JSX.Element {
  const medplum = useMedplum();
  const { patient, encounter } = props;
  const [allergies, setAllergies] = useState<AllergyIntolerance[]>(props.allergies);
  const [opened, { open, close }] = useDisclosure(false);
  const [code, setCode] = useState<CodeableConcept>();

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      console.log('handleSubmit', formData);
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
      <Group position="apart">
        <Text fz="md" fw={700}>
          Allergies
        </Text>
        <Anchor href="#" onClick={open}>
          + Add
        </Anchor>
      </Group>
      {allergies.length > 0 ? (
        <Box>
          {allergies.map((allergy) => (
            <Badge key={allergy.id} maw="100%">
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
              data-autofocus={true}
              binding="http://hl7.org/fhir/us/core/ValueSet/us-core-allergy-substance"
              onChange={(allergy) => setCode(allergy)}
            />
            <TextInput name="reaction" label="Reaction" />
            <NativeSelect name="status" label="Status" data={['active']} />
            <TextInput name="onset" label="Onset" type="date" />
            <Group position="right" spacing={4} mt="md">
              <Button type="submit">Save</Button>
            </Group>
          </Stack>
        </Form>
      </Modal>
    </>
  );
}
