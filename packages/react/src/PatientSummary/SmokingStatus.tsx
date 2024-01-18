import { Anchor, Badge, Box, Button, Group, Modal, Radio, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { HTTP_HL7_ORG, LOINC, SNOMED, createReference } from '@medplum/core';
import { Encounter, Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useState } from 'react';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import { Form } from '../Form/Form';
import { killEvent } from '../utils/dom';

// Smoking Status widget
// See: https://build.fhir.org/ig/HL7/US-Core/StructureDefinition-us-core-smokingstatus.html

const smokingStatusOptions: Record<string, string> = {
  '266919005': 'Never smoked tobacco',
  '266927001': 'Tobacco smoking consumption unknown',
  '428041000124106': 'Occasional tobacco smoker',
  '428061000124105': 'Light tobacco smoker',
  '428071000124103': 'Heavy tobacco smoker',
  '449868002': 'Smokes tobacco daily',
  '77176002': 'Smoker',
  '8517006': 'Ex-smoker',
};

export interface SmokingStatusProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly smokingStatus?: Observation;
}

export function SmokingStatus(props: SmokingStatusProps): JSX.Element {
  const medplum = useMedplum();
  const { patient, encounter } = props;
  const [smokingStatus, setSmokingStatus] = useState<Observation | undefined>(props.smokingStatus);
  const [opened, { open, close }] = useDisclosure(false);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      medplum
        .createResource<Observation>({
          resourceType: 'Observation',
          meta: {
            profile: [HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-smokingstatus'],
          },
          status: 'final',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                  code: 'social-history',
                  display: 'Social History',
                },
              ],
              text: 'Social History',
            },
          ],
          code: {
            coding: [
              {
                system: LOINC,
                code: '72166-2',
                display: 'Tobacco smoking status',
              },
            ],
            text: 'Tobacco smoking status',
          },
          subject: createReference(patient),
          encounter: encounter ? createReference(encounter) : undefined,
          effectiveDateTime: new Date().toISOString(),
          valueCodeableConcept: {
            coding: [
              {
                system: SNOMED,
                version: SNOMED + '/731000124108',
                code: formData.smokingStatus,
              },
            ],
            text: smokingStatusOptions[formData.smokingStatus],
          },
        })
        .then((newSmokingStatus) => {
          setSmokingStatus(newSmokingStatus);
          close();
        })
        .catch(console.error);
    },
    [medplum, patient, encounter, close]
  );

  return (
    <>
      <Group justify="space-between">
        <Text fz="md" fw={700}>
          Smoking Status
        </Text>
        <Anchor
          href="#"
          onClick={(e) => {
            killEvent(e);
            open();
          }}
        >
          + Edit
        </Anchor>
      </Group>
      {smokingStatus?.valueCodeableConcept ? (
        <Box>
          <Badge variant="light">
            <CodeableConceptDisplay value={smokingStatus.valueCodeableConcept} />
          </Badge>
        </Box>
      ) : (
        <Text>(none)</Text>
      )}
      <Modal opened={opened} onClose={close} title="Set Smoking Status">
        <Form onSubmit={handleSubmit}>
          <Stack>
            <Radio.Group name="smokingStatus" label="Smoking Status" required>
              {Object.entries(smokingStatusOptions).map(([code, text]) => (
                <Radio key={code} value={code} label={text} my="xs" />
              ))}
            </Radio.Group>
            <Group justify="flex-end" gap={4} mt="md">
              <Button type="submit">Save</Button>
            </Group>
          </Stack>
        </Form>
      </Modal>
    </>
  );
}
